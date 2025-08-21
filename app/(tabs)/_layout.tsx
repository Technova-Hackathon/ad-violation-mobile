import { Tabs } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: "#1f1f1f",
          borderTopColor: "#2a2a2a",
          height: Platform.select({ ios: 88, android: 60 }),
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12 },
        tabBarActiveTintColor: "white",
        tabBarInactiveTintColor: "gray",
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Camera",
        tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "camera" : "camera-outline"}
              size={size ?? 22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{ title: "Reports",
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? "file-document" : "file-document-outline"}
              size={size ?? 22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
