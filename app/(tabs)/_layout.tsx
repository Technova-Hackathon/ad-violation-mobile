import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: "#222",
          paddingBottom: 8,
          height: 60,
        },
        tabBarActiveTintColor: "white",
        tabBarInactiveTintColor: "gray",
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Camera" }}
      />
      <Tabs.Screen
        name="two"
        options={{ title: "Reports" }}
      />
    </Tabs>
  );
}
