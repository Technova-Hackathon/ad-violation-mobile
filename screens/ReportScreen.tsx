import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../utils/supabase";

export default function ReportsScreen() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch reports on mount
  useEffect(() => {
    const fetchReports = async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Error fetching reports:", error);
      } else {
        setReports(data || []);
      }
      setLoading(false);
    };

    fetchReports();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000" />
        <Text>Loading reports...</Text>
      </View>
    );
  }

  if (reports.length === 0) {
    return (
      <View style={styles.center}>
        <Text>No reports submitted yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={reports}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Image source={{ uri: item.image_url }} style={styles.thumbnail} />
          <View style={styles.info}>
            <Text style={styles.status}>
              {item.status === "pending" ? "⏳ Pending" : "✅ Reviewed"}
            </Text>
            <Text style={styles.address}>{item.address}</Text>
            <Text style={styles.coords}>
              📍 {item.lat?.toFixed(4)}, {item.lon?.toFixed(4)}
            </Text>
            <Text style={styles.date}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 10 },
  card: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 10,
    marginBottom: 10,
    borderRadius: 12,
    elevation: 2,
  },
  thumbnail: { width: 80, height: 100, borderRadius: 8 },
  info: { flex: 1, marginLeft: 10, justifyContent: "center" },
  status: { fontWeight: "bold", marginBottom: 4 },
  address: { fontSize: 14, marginBottom: 2 },
  coords: { fontSize: 12, color: "#555" },
  date: { fontSize: 12, color: "#888", marginTop: 4 },
});
