import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Camera, CameraType } from "expo-camera";
import * as Location from "expo-location";
import { useIsFocused } from "@react-navigation/native";
import { BarCodeScanner } from "expo-barcode-scanner";
import * as FileSystem from "expo-file-system";
import { decode as atob } from "base-64";

import API_BASE_URL from "../utils/api";
import { supabase } from "../utils/supabase";

type Coords = { latitude: number; longitude: number };

// -------------------- Geofence + Time Window CONFIG --------------------
// Fill these with your actual venue/time window
const GEOFENCE_CENTER = { lat: 12.9716, lon: 77.5946 }; // example: Bengaluru center
const GEOFENCE_RADIUS_M = 150; // meters
const WINDOW_START_ISO = "2025-08-22T08:00:00Z";
const WINDOW_END_ISO = "2025-08-22T18:00:00Z";

// -------------------- Helpers: distance/time checks --------------------
function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2),
    sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function checkGeofence(user: { latitude: number; longitude: number }) {
  const dist = haversineMeters(
    { lat: user.latitude, lon: user.longitude },
    { lat: GEOFENCE_CENTER.lat, lon: GEOFENCE_CENTER.lon }
  );
  return dist <= GEOFENCE_RADIUS_M
    ? { ok: true as const }
    : { ok: false as const, reason: "Out of allowed zone" };
}

function checkTimeWindow(now = new Date()) {
  const start = new Date(WINDOW_START_ISO);
  const end = new Date(WINDOW_END_ISO);
  return now >= start && now <= end
    ? { ok: true as const }
    : { ok: false as const, reason: "Outside allowed time" };
}

export default function CameraScreen() {
  // -------------------- Permissions & Camera Setup --------------------
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [qrPerm, setQrPerm] = useState<boolean | null>(null);

  const [isCameraReady, setIsCameraReady] = useState(false);
  const [ratio, setRatio] = useState("9:16");
  const cameraRef = useRef<Camera | null>(null);
  const screenWidth = Dimensions.get("window").width;
  const isFocused = useIsFocused();

  // -------------------- State Flags --------------------
  const [isUploading, setIsUploading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // -------------------- Result Modal --------------------
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [resultData, setResultData] = useState<any>(null);

  // -------------------- QR Scanner --------------------
  const [qrValue, setQrValue] = useState<string | null>(null);
  const onBarCodeScanned = ({ data }: { data: string }) => {
    setQrValue(data);
  };

  // -------------------- Ask Permissions on Mount --------------------
  useEffect(() => {
    (async () => {
      const { status: camStatus } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(camStatus === "granted");

      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(locStatus === "granted");

      const { status: qrStatus } = await BarCodeScanner.requestPermissionsAsync();
      setQrPerm(qrStatus === "granted");

      if (locStatus === "granted") {
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        console.log("✅ GPS primed at startup");
      }
    })();
  }, []);

  // -------------------- Camera Ready Handler --------------------
  const onCameraReady = async () => {
    if (isUploading) return;
    setIsCameraReady(true);
    if (cameraRef.current) {
      const supportedRatios = await cameraRef.current.getSupportedRatiosAsync();
      setRatio(supportedRatios.includes("9:16") ? "9:16" : supportedRatios[0] || "9:16");
    }
  };

  // -------------------- Upload + Insert to Supabase --------------------
  // Returns { url, id } for the inserted row, or nulls on failure
  async function uploadToSupabase(
    photoUri: string,
    coords: Coords,
    address: string,
    opts?: { status?: string; message?: string; userId?: string | null }
  ): Promise<{ url: string | null; id: string | null }> {
    const status = opts?.status ?? "pending";
    const message = opts?.message ?? null;
    const userId = opts?.userId ?? null;

    try {
      const fileExt = "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `reports/${fileName}`;

      // Convert image to base64 → Uint8Array
      const base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      // Upload to Supabase Storage (public bucket)
      const { error: storageError } = await supabase.storage
        .from("reports")
        .upload(filePath, buffer, { contentType: "image/jpeg" });

      if (storageError) throw storageError;

      // Get public URL
      const { data: publicUrl } = supabase.storage.from("reports").getPublicUrl(filePath);

      // Insert row and return id
      const { data: insertData, error } = await supabase
        .from("reports")
        .insert([
          {
            user_id: userId,
            image_url: publicUrl.publicUrl,
            lat: coords.latitude,
            lon: coords.longitude,
            address,
            status,
            message,
          },
        ])
        .select("id")
        .single();

      if (error) throw error;

      console.log("✅ Uploaded & inserted:", publicUrl.publicUrl, insertData?.id);
      return { url: publicUrl.publicUrl, id: insertData?.id ?? null };
    } catch (err) {
      console.error("❌ Supabase upload/insert failed:", err);
      return { url: null, id: null };
    }
  }

  // -------------------- Capture + Flow --------------------
  const takePicture = async () => {
    if (isUploading || !cameraRef.current || !isCameraReady) return;

    setIsUploading(true);

    try {
      // 1) Capture
      const photo = await cameraRef.current.takePictureAsync();
      console.log("✅ Captured:", photo.uri);

      // 2) Location with cached fallback
      let coords: Coords = { latitude: 0, longitude: 0 };
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          coords = {
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
          };
        } else {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
          coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        }
      } catch (locErr) {
        console.warn("⚠️ Location fetch failed:", locErr);
      }

      // 3) Reverse geocode
      let address = "Unknown location";
      try {
        const places = await Location.reverseGeocodeAsync(coords);
        if (places.length > 0) {
          const p = places[0];
          address = `${p.street || ""}, ${p.city || ""}, ${p.region || ""}, ${p.country || ""}`;
        }
      } catch (geoErr) {
        console.warn("⚠️ Reverse geocoding failed:", geoErr);
      }

      // 4) Local quick checks (geofence/time)
      const geo = checkGeofence(coords);
      const tw = checkTimeWindow();

      const preliminary =
        !geo.ok ? { status: "violation", message: "Out of allowed zone" }
        : !tw.ok ? { status: "violation", message: "Outside allowed time" }
        : { status: "pending", message: null as string | null };

      // 5) Get user id
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp?.user?.id ?? null;

      // 6) Upload + insert "pending" or local violation, capture row id
      const up = await uploadToSupabase(photo.uri, coords, address, {
        status: preliminary.status,
        message: preliminary.message ?? undefined,
        userId,
      });
      const supabaseUrl = up.url;
      const reportId = up.id;

      // 7) Call backend analyze with public URL + qr_value + coords + report_id
      const controller = new AbortController();
      setAbortController(controller);

      const formData = new FormData();
      formData.append("image_url", supabaseUrl ?? ""); // public URL from Storage
      formData.append("lat", coords.latitude.toString());
      formData.append("lon", coords.longitude.toString());
      formData.append("qr_value", qrValue ?? "");
      if (reportId) formData.append("report_id", reportId);

      let data: any = null;
      try {
        const res = await fetch(`${API_BASE_URL}/analyze`, {
          method: "POST",
          body: formData,
          headers: { "Content-Type": "multipart/form-data" },
          signal: controller.signal,
        });
        data = await res.json();
        console.log("✅ Backend response:", data);
      } catch (e) {
        console.warn("⚠️ Backend analyze call failed:", e);
      }

      // 8) Final status/message for UI (prefer server verdict; otherwise, success if upload ok and no local violation)
      const serverStatus = data?.status as string | undefined;
      const serverMessage = data?.message as string | undefined;

      let finalStatus: string;
      let finalMessage: string;

      if (serverStatus) {
        finalStatus = serverStatus;
        finalMessage =
          serverMessage ??
          (serverStatus === "success" ? "Report stored in Supabase" : "Policy violation detected");
      } else {
        // If server didn't respond, fall back: success if upload worked and not a local violation; else error
        if (preliminary.status === "violation") {
          finalStatus = "violation";
          finalMessage = preliminary.message ?? "Policy violation detected";
        } else if (supabaseUrl) {
          finalStatus = "success";
          finalMessage = "Report stored in Supabase";
        } else {
          finalStatus = "error";
          finalMessage = "Upload failed";
        }
      }

      // 9) Show modal
      setResultData({
        status: finalStatus,
        message: finalMessage,
        user_id: userId,
        photoUri: photo.uri,
        address,
        supabaseUrl,
        lat: coords.latitude,
        lon: coords.longitude,
      });
      setResultModalVisible(true);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        console.log("❌ Upload aborted by user");
      } else {
        console.error("❌ Error in takePicture:", err);
        setResultData({
          status: "error",
          message: "Could not capture or send photo",
        });
        setResultModalVisible(true);
      }
    } finally {
      setAbortController(null);
      setTimeout(() => setIsUploading(false), 1000);
    }
  };

  // -------------------- Cancel Upload --------------------
  const cancelUpload = () => {
    if (abortController) abortController.abort();
    setIsUploading(false);
  };

  // -------------------- Permission Checks --------------------
  if (hasPermission === null)
    return (
      <View style={styles.center}>
        <Text>Requesting camera permissions...</Text>
      </View>
    );
  if (hasPermission === false)
    return (
      <View style={styles.center}>
        <Text>No access to camera</Text>
      </View>
    );

  // -------------------- Camera Layout --------------------
  const [w, h] = ratio.split(":").map(Number);
  const cameraHeight = (screenWidth * h) / w;

  return (
    <View style={styles.container}>
      {isFocused ? (
        <Camera
          style={{ width: screenWidth, height: cameraHeight }}
          type={CameraType.back}
          ratio={ratio}
          ref={cameraRef}
          onCameraReady={onCameraReady}
        >
          {/* QR overlay (scans continuously) */}
          {qrPerm && (
            <View
              style={{
                position: "absolute",
                bottom: 110,
                alignSelf: "center",
                width: 220,
                height: 120,
                overflow: "hidden",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.4)",
                backgroundColor: "rgba(0,0,0,0.15)",
              }}
            >
              <BarCodeScanner
                style={{ width: "100%", height: "100%" }}
                onBarCodeScanned={onBarCodeScanned}
              />
            </View>
          )}

          {/* Capture button */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, isUploading && { backgroundColor: "gray" }]}
              onPress={takePicture}
              disabled={isUploading}
            >
              <Text style={styles.text}>📸 Capture</Text>
            </TouchableOpacity>
          </View>
        </Camera>
      ) : (
        <View style={styles.center}>
          <Text>Camera paused</Text>
        </View>
      )}

      {/* 🔄 Uploading Overlay */}
      {isUploading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>Uploading...</Text>
          <TouchableOpacity style={styles.cancelButton} onPress={cancelUpload}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Result Modal */}
      <Modal
        visible={resultModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setResultModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {resultData?.status === "success"
                ? "✅ Issue Reported"
                : resultData?.status === "violation"
                ? "🚫 Violation Detected"
                : "⚠️ Upload Failed"}
            </Text>

            {resultData?.photoUri && (
              <Image source={{ uri: resultData.photoUri }} style={styles.previewImage} />
            )}

            {resultData?.message && (
              <Text style={styles.modalText}>{resultData.message}</Text>
            )}

            {resultData?.user_id && (
              <Text style={styles.modalText}>{resultData.user_id}</Text>
            )}

            {resultData?.lat != null && resultData?.lon != null && (
              <Text style={styles.modalText}>
                📍 {resultData.lat}, {resultData.lon}
              </Text>
            )}

            {resultData?.address && (
              <Text style={styles.modalText}>🏠 {resultData.address}</Text>
            )}

            {resultData?.supabaseUrl && (
              <Text style={styles.modalText}>☁️ We Will Get in Touch with the Report</Text>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setResultModalVisible(false)}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// -------------------- Styles --------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  buttonContainer: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  button: {
    backgroundColor: "#00000080",
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  text: { fontSize: 18, color: "white" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayText: { marginTop: 10, color: "white", fontSize: 16 },
  cancelButton: {
    marginTop: 15,
    backgroundColor: "#FF3B30",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelText: { color: "white", fontWeight: "600", fontSize: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    width: "80%",
    alignItems: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  modalText: { fontSize: 15, marginBottom: 8, textAlign: "center" },
  previewImage: {
    width: 200,
    height: 300,
    borderRadius: 12,
    marginVertical: 10,
    resizeMode: "cover",
  },
  closeButton: {
    marginTop: 12,
    backgroundColor: "#007AFF",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  closeText: { color: "white", fontWeight: "600" },
});
