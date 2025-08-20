import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  Modal,
  Image,
  ActivityIndicator,
} from "react-native";
import { Camera, CameraType } from "expo-camera";
import * as Location from "expo-location";
import { useIsFocused } from "@react-navigation/native";
import API_BASE_URL from "../utils/api";

export default function CameraScreen() {
  // -------------------- Permissions & Camera Setup --------------------
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(
    null
  );
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [ratio, setRatio] = useState("9:16");
  const cameraRef = useRef<Camera | null>(null);
  const screenWidth = Dimensions.get("window").width;
  const isFocused = useIsFocused();

  // -------------------- State Flags --------------------
  const [isUploading, setIsUploading] = useState(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  // -------------------- Result Modal --------------------
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [resultData, setResultData] = useState<any>(null);

  // -------------------- Ask Permissions on Mount --------------------
  useEffect(() => {
    (async () => {
      const { status: camStatus } =
        await Camera.requestCameraPermissionsAsync();
      setHasPermission(camStatus === "granted");

      const { status: locStatus } =
        await Location.requestForegroundPermissionsAsync();
      setLocationPermission(locStatus === "granted");

      if (locStatus === "granted") {
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
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
      setRatio(
        supportedRatios.includes("9:16")
          ? "9:16"
          : supportedRatios[0] || "9:16"
      );
    }
  };

  // -------------------- Capture + Upload --------------------
  const takePicture = async () => {
    if (isUploading || !cameraRef.current || !isCameraReady) return;

    setIsUploading(true);

    try {
      // 📸 Capture
      const photo = await cameraRef.current.takePictureAsync();
      console.log("✅ Captured:", photo.uri);

      // 📡 Location with cached fallback
      let coords = { latitude: 0, longitude: 0 };
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          coords = {
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
          };
          console.log("✅ Using cached location:", coords);
        } else {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Low,
          });
          coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          console.log("✅ Fresh GPS location:", coords);
        }
      } catch (locErr) {
        console.warn("⚠️ Location fetch failed:", locErr);
      }

      // 🏠 Reverse geocode
      let address = "Unknown location";
      try {
        const places = await Location.reverseGeocodeAsync(coords);
        if (places.length > 0) {
          const place = places[0];
          address = `${place.street || ""}, ${place.city || ""}, ${
            place.region || ""
          }, ${place.country || ""}`;
        }
      } catch (geoErr) {
        console.warn("⚠️ Reverse geocoding failed:", geoErr);
      }

      // 📤 Prepare FormData
      const formData = new FormData();
      formData.append("image", {
        uri: photo.uri,
        type: "image/jpeg",
        name: "photo.jpg",
      } as any);
      formData.append("lat", coords.latitude.toString());
      formData.append("lon", coords.longitude.toString());

      // 🚀 Send to backend with cancel option
      const controller = new AbortController();
      setAbortController(controller);

      const res = await fetch(`${API_BASE_URL}/analyze`, {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "multipart/form-data" },
        signal: controller.signal,
      });

      const data = await res.json();
      console.log("✅ Backend response:", data);

      setResultData({ ...data, photoUri: photo.uri, address });
      setResultModalVisible(true);
    } catch (err: any) {
      if (err.name === "AbortError") {
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
    if (abortController) {
      abortController.abort();
    }
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
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, isUploading && { backgroundColor: "gray" }]}
              onPress={takePicture}
              disabled={isUploading}
            >
              <Text style={styles.text}>
                {isUploading ? "⏳ Uploading..." : "📸 Capture"}
              </Text>
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
                : "⚠️ Upload Failed"}
            </Text>
            {resultData?.photoUri && (
              <Image
                source={{ uri: resultData.photoUri }}
                style={styles.previewImage}
              />
            )}
            <Text style={styles.modalText}>
              {resultData?.message || "No message available"}
            </Text>
            {resultData?.lat && resultData?.lon && (
              <Text style={styles.modalText}>
                📍 {resultData.lat}, {resultData.lon}
              </Text>
            )}
            {resultData?.address && (
              <Text style={styles.modalText}>🏠 {resultData.address}</Text>
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

  // 🔄 Spinner overlay
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

  // Modal styles
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
