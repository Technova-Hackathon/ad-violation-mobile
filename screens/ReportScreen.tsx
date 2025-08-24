import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { supabase } from "../utils/supabase";

type Report = {
  id: string;
  user_id: string | null;
  image_url: string | null;
  lat: number | null;
  lon: number | null;
  address: string | null;
  status: string | null;
  created_at: string;
  message: string | null;
};

const PAGE_SIZE = 12;

export default function ReportsScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [endReached, setEndReached] = useState(false);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(async (pageIndex: number) => {
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    return (data ?? []) as Report[];
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPage(0);
      setReports(data);
      setPage(0);
      setEndReached(data.length < PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchPage(0);
      setReports(data);
      setPage(0);
      setEndReached(data.length < PAGE_SIZE);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || endReached || loading) return;
    loadingMoreRef.current = true;
    try {
      const next = page + 1;
      const data = await fetchPage(next);
      setReports(prev => [...prev, ...data]);
      setPage(next);
      if (data.length < PAGE_SIZE) setEndReached(true);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [page, endReached, loading, fetchPage]);

  const renderItem = ({ item }: { item: Report }) => {
    // NEW: Conditional message based on the issue
    let displayMessage = item.message;
    if (item.message?.includes('No billboard detected')) {
        displayMessage = 'You are supposed to click a Billboard Picture';
    } else if (item.message?.includes('Missing QR')) {
        displayMessage = 'Violation Report will be drafted Soon';
    } else if (item.message?.includes('No license information')) {
        displayMessage = 'Sorry but there is no issue in the Billboard';
    }

    const subtitle =
      displayMessage ??
      item.address ??
      (item.lat != null && item.lon != null
        ? `📍 ${item.lat.toFixed(4)}, ${item.lon.toFixed(4)}`
        : "No details");

    return (
      <View style={styles.card}>
        <Thumb uri={item.image_url} />
        <View style={styles.info}>
          {/* UPDATED: Display the dynamic status label */}
          <Text style={styles.status}>{statusLabel(item.status, item.message)}</Text>
          <Text style={styles.address} numberOfLines={2}>
            {subtitle}
          </Text>
          <Text style={styles.date}>
            {new Date(item.created_at).toLocaleString()}
          </Text>
        </View>
      </View>
    );
  };

  if (loading && reports.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000" />
        <Text>Loading reports...</Text>
      </View>
    );
  }

  if (!loading && reports.length === 0) {
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
      renderItem={renderItem}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      onEndReachedThreshold={0.3}
      onEndReached={loadMore}
      ListFooterComponent={
        !endReached ? (
          <View style={{ paddingVertical: 12 }}>
            <ActivityIndicator />
          </View>
        ) : null
      }
    />
  );
}

function Thumb({ uri }: { uri: string | null }) {
  const [errored, setErrored] = useState(false);
  if (!uri || errored) {
    return (
      <View style={styles.thumbFallback}>
        <Text style={{ textAlign: 'center' }}>📷</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.thumbnail}
      resizeMode="cover"
      onError={() => setErrored(true)}
    />
  );
}


function statusLabel(status?: string | null, message?: string | null) {
  // NEW: Check for specific messages from the backend
  if (message?.includes('No billboard detected')) {
    return '⚠️ Invalid Image';
  }
  if (message?.includes('Missing QR')) {
    return '🚫 Violation Detected';
  }
  if (message?.includes('Invalid QR format')) {
    //There is an underlying issue with QRcode Scanner that when detectes QR changes it to Invalid QR format
    return '✅ All Correct';
  }

  // Fallback to the original status logic if no specific message is found
  const map: Record<string, string> = {
    pending: "⏳ Pending",
    success: "✅ All Correct", // Updated to reflect the desired success message
    warning: "⚠️ Warning",
    error: "⛔ Error",
    violation: "🚫 Violation",
  };
  return map[status ?? "pending"] ?? "⏳ Pending";
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
  thumbnail: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
    resizeMode: "cover",
  },
  thumbFallback: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  info: { flex: 1, marginLeft: 10, justifyContent: "center" },
  status: { fontWeight: "bold", marginBottom: 4 },
  address: { fontSize: 14, color: "#111", marginBottom: 4 },
  date: { fontSize: 12, color: "#666" },
});
