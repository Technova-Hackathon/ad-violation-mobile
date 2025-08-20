import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  Modal,
  Image,
} from "react-native";
import { Camera, CameraType } from "expo-camera";
import * as Location from "expo-location";
import API_BASE_URL from "../utils/api";

export default function CameraScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(
    null
  );
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [ratio, setRatio] = useState("9:16");
  const cameraRef = useRef<Camera | null>(null);

  const screenWidth = Dimensions.get("window").width;

  // Busy flag
  const [isUploading, setIsUploading] = useState(false);

  // Result modal
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [resultData, setResultData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      // Ask for Camera permission
      const { status: camStatus } =
        await Camera.requestCameraPermissionsAsync();
      setHasPermission(camStatus === "granted");

      // Ask for Location permission
      const { status: locStatus } =
        await Location.requestForegroundPermissionsAsync();
      setLocationPermission(locStatus === "granted");

      if (locStatus === "granted") {
        // warm up GPS
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        console.log("✅ GPS primed at startup");
      }
    })();
  }, []);

  const onCameraReady = async () => {
    if (isUploading) return;
    setIsCameraReady(true);
    if (cameraRef.current) {
      const supportedRatios = await cameraRef.current.getSupportedRatiosAsync();
      if (supportedRatios.includes("9:16")) {
        setRatio("9:16");
      } else {
        setRatio(supportedRatios[0] || "9:16");
      }
    }
  };

  const takePicture = async () => {
    if (isUploading || !cameraRef.current || !isCameraReady) return;

    setIsUploading(true);

    try {
      // 1. Capture
      const photo = await cameraRef.current.takePictureAsync();
      console.log("✅ Captured:", photo.uri);

      // 2. GPS coords
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      // 3. Reverse geocode (safe)
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

      // 4. Prepare formData
      const formData = new FormData();
      formData.append("image", {
        uri: photo.uri,
        type: "image/jpeg",
        name: "photo.jpg",
      } as any);
      formData.append("lat", coords.latitude.toString());
      formData.append("lon", coords.longitude.toString());

      // 5. Send to backend
      const res = await fetch(`${API_BASE_URL}/analyze`, {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = await res.json();
      console.log("✅ Backend response:", data);

      // 6. Show modal with result + photo + address
      setResultData({ ...data, photoUri: photo.uri, address });
      setResultModalVisible(true);
    } catch (err) {
      console.error("❌ Error in takePicture:", err);
      setResultData({
        status: "error",
        message: "Could not capture or send photo",
      });
      setResultModalVisible(true);
    } finally {
      setTimeout(() => setIsUploading(false), 2000);
    }
  };

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

  const [w, h] = ratio.split(":").map(Number);
  const cameraHeight = (screenWidth * h) / w;

  return (
    <View style={styles.container}>
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

      {/* Custom Modal */}
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
                ? "✅ Violation Reported"
                : "⚠️ Upload Failed"}
            </Text>

            {/* 📸 Preview thumbnail */}
            {resultData?.photoUri && (
              <Image
                source={{ uri: resultData.photoUri }}
                style={styles.previewImage}
              />
            )}

            {/* 📝 Message */}
            <Text style={styles.modalText}>
              {resultData?.message || "No message available"}
            </Text>

            {/* 📍 Coords */}
            {resultData?.lat && resultData?.lon && (
              <Text style={styles.modalText}>
                📍 {resultData.lat}, {resultData.lon}
              </Text>
            )}

            {/* 🏠 Address */}
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  modalText: {
    fontSize: 15,
    marginBottom: 8,
    textAlign: "center",
  },
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
