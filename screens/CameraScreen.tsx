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
import * as FileSystem from "expo-file-system";
import { decode as atob } from "base-64";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons"; // Import Ionicons

import API_BASE_URL from "../utils/api";
import { supabase } from "../utils/supabase";

type Coords = { latitude: number; longitude: number };

// -------------------- Geofence CONFIG --------------------
const GEOFENCE_CENTER = { lat: 20.2961, lon: 85.8245 }; // Approximate: Bhubaneswar, Odisha
const GEOFENCE_RADIUS_M = 1500; // meters

// -------------------- Helpers: distance checks --------------------
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

export default function CameraScreen() {
  // -------------------- Permissions & Camera Setup --------------------
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const cameraRef = useRef<Camera | null>(null);
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  // -------------------- State Flags --------------------
  const [isUploading, setIsUploading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // -------------------- Result Modal --------------------
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [resultData, setResultData] = useState<any>(null);

  // -------------------- QR Scanner --------------------
  const [scanEnabled, setScanEnabled] = useState(true);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);

  const onBarCodeScanned = ({ data }: { data: string }) => {
    if (!scanEnabled) return;

    setScanEnabled(false); // Disable further scans
    setQrValue(data);
    setScanModalVisible(true);

    // Re-enable scanning after 3 seconds and hide the popup
    setTimeout(() => {
      setScanModalVisible(false);
      setScanEnabled(true);
    }, 3000);
  };

  // -------------------- Ask Permissions on Mount --------------------
  useEffect(() => {
    (async () => {
      const { status: camStatus } = await Camera.requestCameraPermissionsAsync();
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      setHasPermission(camStatus === "granted" && locStatus === "granted");

      if (locStatus === "granted") {
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        console.log("✅ GPS primed at startup");
      }
    })();
  }, []);

  // -------------------- Upload + Insert to Supabase --------------------
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

      const base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      const { error: storageError } = await supabase.storage
        .from("reports")
        .upload(filePath, buffer, { contentType: "image/jpeg" });

      if (storageError) throw storageError;

      const { data: publicUrlData } = supabase.storage.from("reports").getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;

      const { data: insertData, error } = await supabase
        .from("reports")
        .insert([
          {
            user_id: userId,
            image_url: publicUrl,
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

      console.log("✅ Uploaded & inserted:", publicUrl, insertData?.id);
      return { url: publicUrl, id: insertData?.id ?? null };
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
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      console.log("✅ Captured:", photo.uri);

      let coords: Coords = { latitude: 0, longitude: 0 };
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      } catch (locErr) {
        console.warn("⚠️ Location fetch failed:", locErr);
      }

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

      const geo = checkGeofence(coords);
      const preliminary =
        !geo.ok ? { status: "violation", message: "Out of allowed zone" }
          : { status: "pending", message: null as string | null };

      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp?.user?.id ?? null;

      const up = await uploadToSupabase(photo.uri, coords, address, {
        status: preliminary.status,
        message: preliminary.message ?? undefined,
        userId,
      });
      const supabaseUrl = up.url;
      const reportId = up.id;

      const controller = new AbortController();
      setAbortController(controller);

      const formData = new FormData();
      formData.append("image_url", supabaseUrl ?? "");
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

      const serverStatus = data?.status as string | undefined;
      const serverMessage = data?.message as string | undefined;

      let finalStatus: string;
      let finalMessage: string;
      
      if (serverMessage?.includes('✅ QR Found Correctly') && !serverMessage.includes('No billboard detected')) {
          finalStatus = 'success';
          finalMessage = serverMessage;
      } else if (serverStatus) {
        finalStatus = serverStatus;
        finalMessage =
          serverMessage ??
          (serverStatus === "success" ? "Report stored in Supabase" : "Policy violation detected");
      } else {
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
      setIsUploading(false);
      setQrValue(null); // Reset QR value after a report
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
        <ActivityIndicator size="large" color="#666" />
        <Text>Requesting permissions...</Text>
      </View>
    );
  if (hasPermission === false)
    return (
      <View style={styles.center}>
        <Text>No access to camera or location</Text>
      </View>
    );

  // -------------------- Camera Layout --------------------
  return (
    <View style={styles.container}>
      {isFocused ? (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          type={CameraType.back}
          ratio={"16:9"}
          onCameraReady={() => setIsCameraReady(true)}
          onBarCodeScanned={scanEnabled ? onBarCodeScanned : undefined}
          barCodeScannerSettings={{
            barCodeTypes: ["qr"],
          }}
        >
          {/* Capture button */}
          <View style={[styles.captureContainer, { bottom: insets.bottom + 20 }]}>
            <TouchableOpacity
              style={[styles.captureButton, isUploading && { backgroundColor: "#555" }]}
              onPress={takePicture}
              disabled={isUploading}
            >
              <Ionicons name="camera" size={28} color="white" />
              <Text style={styles.captureText}>Capture</Text>
            </TouchableOpacity>
          </View>
        </Camera>
      ) : (
        <View style={styles.center}>
          <Text>Camera paused</Text>
        </View>
      )}

      {/* QR Scanned Popup */}
      {scanModalVisible && (
        <View style={styles.qrPopup}>
          <Text style={styles.qrPopupText}>✅ QR Scanned!</Text>
        </View>
      )}

      {/* 🔄 Uploading Overlay */}
      {isUploading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>Uploading & Analyzing...</Text>
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
            {/* UPDATED: Title logic to prioritize QR scan messages */}
            <Text style={styles.modalTitle}>
              {resultData?.message?.includes('Invalid QR format')
                ? "✅ No Issues Detected"
                : resultData?.message?.includes('No billboard detected')
                ? "⚠️ Invalid Image"
                : "🚫 Violation Detected"}
            </Text>

            {resultData?.photoUri && (
              <Image source={{ uri: resultData.photoUri }} style={styles.previewImage} />
            )}
            
            {/* NEW: Conditional message for license info based on QR scan, now after the image */}
            {resultData?.message && (
              <>
                {resultData.message.includes('Invalid QR format') && (
                  <Text style={styles.modalText}>✅ License Information Detected</Text>
                )}
                {resultData.message.includes('Missing QR') && (
                  <Text style={styles.modalText}>🚫 No License Information Detected</Text>
                )}
              </>
            )}

            {resultData?.message && resultData.message
              .split('; ')
              .map((msg: string) => msg.trim())
              .filter((msg: string) => msg !== "Outside allowed time" && msg !== "✅ QR Found Correctly" && msg !== "Missing QR" && msg !== "Invalid QR format" && msg !== "No license information detected." && msg !== "No billboard detected" && msg !== "Out of allowed zone") // ⬅️ NEW: Added "Out of allowed zone" to the filter list
              .map((msg: string) => (
                <Text key={msg} style={styles.modalText}>
                  {msg}
                </Text>
            ))}


            {resultData?.user_id && (
              <Text style={styles.modalText}>User ID: {resultData.user_id}</Text>
            )}

            {resultData?.lat != null && resultData?.lon != null && (
              <Text style={styles.modalText}>
                📍 {resultData.lat.toFixed(5)}, {resultData.lon.toFixed(5)}
              </Text>
            )}

            {resultData?.address && (
              <Text style={styles.modalText}>🏠 {resultData.address}</Text>
            )}
            
            {/* NEW: Conditional messages based on heading */}
            {resultData?.message?.includes('No billboard detected') ? (
                <Text style={styles.modalText}>☹️ You are supposed to click a Billboard Picture</Text>
            ) : resultData?.message?.includes('Missing QR') ? (
                <Text style={styles.modalText}>‼️ Violation Report will be drafted Soon</Text>
            ) : resultData?.message?.includes('Invalid QR format') ? (
                <Text style={styles.modalText}>💫 Sorry but there is no issue in the Billboard</Text>
            ) : null}

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

// -------------------- Styles (Merged) --------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  captureContainer: {
    position: "absolute",
    alignSelf: "center",
  },
  captureButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)'
  },
  captureText: {
    color: "white",
    fontSize: 18,
    marginLeft: 10,
    fontWeight: '600'
  },

  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayText: { marginTop: 12, color: "white", fontSize: 18, fontWeight: '500' },
  cancelButton: {
    marginTop: 20,
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
    width: "85%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 15, textAlign: 'center' },
  modalText: { fontSize: 15, marginBottom: 8, textAlign: "center", color: '#333' },
  previewImage: {
    width: '100%',
    aspectRatio: 3/4,
    borderRadius: 12,
    marginVertical: 10,
    resizeMode: "cover",
  },
  closeButton: {
    marginTop: 15,
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
  },
  closeText: { color: "white", fontWeight: "bold", fontSize: 16 },

  qrPopup: {
    position: "absolute",
    top: "15%",
    alignSelf: "center",
    backgroundColor: "rgba(46, 204, 113, 0.9)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  qrPopupText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
