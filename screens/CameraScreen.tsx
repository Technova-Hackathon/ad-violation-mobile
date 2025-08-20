import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, Text, View, TouchableOpacity, Dimensions, Alert } from "react-native";
import { Camera, CameraType } from "expo-camera";
import * as Location from "expo-location";
import API_BASE_URL from "../utils/api";

export default function CameraScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [ratio, setRatio] = useState("9:16");
  const cameraRef = useRef<Camera | null>(null);

  const screenWidth = Dimensions.get("window").width;
  // Busy flag
  const [isUploading, setIsUploading] = useState(false);
  // 🔎 Debug watcher
  useEffect(() => {
    console.log("🔄 isUploading changed:", isUploading);
  }, [isUploading]);
  // ask for permissions
  useEffect(() => {

    (async () => {
      // Ask for Camera permission
      const { status: camStatus } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(camStatus === "granted");

      // Ask for Location permission (forces popup right away)
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(locStatus === "granted");

      if (locStatus !== "granted") {
        Alert.alert("Permission needed", "GPS access is required to record violations.");
      } else {
        // 🔥 Pre-fetch once to warm up GPS
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        console.log("✅ GPS primed at startup");
      }
    })();
  }, []);


  const onCameraReady = async () => {
    if (isUploading) {
      console.log("⚠️ Already uploading, please wait...");
      return;
    }
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
    if (!locationPermission) {
      Alert.alert("Permission needed", "GPS access is required to capture violations.");
      return;
    }

    if (cameraRef.current && isCameraReady) {
      try {
        console.log("📸 Taking picture...");
        const photo = await cameraRef.current.takePictureAsync();
        console.log("✅ Captured:", photo.uri);

        // get location
        let coords = { latitude: 0, longitude: 0 };
        if (locationPermission) {
          const loc = await Location.getCurrentPositionAsync({});
          coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        }
        console.log("🌍 Location:", coords);

        // prepare data
        const formData: any = new FormData();
        formData.append("image", {
          uri: photo.uri,
          type: "image/jpeg",
          name: "photo.jpg",
        } as any);
        formData.append("lat", coords.latitude.toString());
        formData.append("lon", coords.longitude.toString());

        console.log("🚀 Sending to backend:", API_BASE_URL);

        const res = await fetch(`${API_BASE_URL}/analyze`, {
          method: "POST",
          body: formData,
          headers: { "Content-Type": "multipart/form-data" },
        });

        console.log("📩 Response status:", res.status);

        const data = await res.json();
        console.log("✅ Backend response:", data);

        Alert.alert("Result", JSON.stringify(data));
      } catch (err) {
        console.error("❌ Error in takePicture:", err);
        Alert.alert("Error", "Could not capture or send photo.");
      }
    } else {
      console.warn("⚠️ Camera not ready yet!");
    }
  };


  if (hasPermission === null) return <View style={styles.center}><Text>Requesting camera permissions...</Text></View>;
  if (hasPermission === false) return <View style={styles.center}><Text>No access to camera</Text></View>;

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
});
