import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ThemeProvider, useTheme } from "./src/contexts/theme";
import { AuthProvider, useAuth } from "./src/contexts/auth";
import { UnlockProvider } from "./src/contexts/unlock";
import { initOfflineSync } from "./src/lib/api";
import { initNotifications } from "./src/lib/notifications";
import { SearchModal } from "./src/components/SearchModal";
import HomeScreen from "./src/screens/HomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import NotebooksScreen from "./src/screens/NotebooksScreen";
import NotebookScreen from "./src/screens/NotebookScreen";
import PageEditorScreen from "./src/screens/PageEditorScreen";
import QuickNotesScreen from "./src/screens/QuickNotesScreen";
import TasksScreen from "./src/screens/TasksScreen";
import LinksScreen from "./src/screens/LinksScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

export type RootStackParamList = {
  Tabs: undefined;
  Notebook: { notebookId: string; title: string };
  Page: { pageId: string; sectionId: string; notebookId: string; title: string };
  Settings: undefined;
  Login: undefined;
  Register: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Home: "home",
  Notebooks: "book",
  "Quick notes": "file-text",
  Tasks: "check-square",
  Links: "share-2",
};

function MainTabs({ navigation }: any) {
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <>
      <Tabs.Navigator
        screenOptions={({ route, navigation: tabNav }) => ({
          headerStyle: { backgroundColor: "transparent" },
          headerBackground: () => (
            <BlurView
              intensity={50}
              tint={theme === "dark" ? "dark" : "light"}
              experimentalBlurMethod="dimezisBlurView"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }]}
            />
          ),
          headerTitleStyle: { color: colors.textPrimary, fontWeight: "500", fontSize: 16 },
          headerShadowVisible: false,
          // Home isn't in the tab bar — every other tab gets a back arrow to it.
          headerLeft:
            route.name === "Home"
              ? undefined
              : () => (
                  <Pressable onPress={() => tabNav.navigate("Home")} style={{ paddingLeft: 16, paddingRight: 6 }}>
                    <Feather name="arrow-left" size={20} color={colors.textPrimary} />
                  </Pressable>
                ),
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Pressable onPress={() => setSearchOpen(true)} style={{ paddingHorizontal: 10 }}>
                <Feather name="search" size={18} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={() => navigation.navigate("Settings")} style={{ paddingLeft: 10, paddingRight: 16 }}>
                <Feather name="settings" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          ),
          // Floating glass pill — lifted, compact, icons centered.
          tabBarStyle: {
            position: "absolute",
            bottom: Math.max(insets.bottom, 8) + 28,
            marginHorizontal: 56,
            height: 50,
            borderRadius: 25,
            borderTopWidth: 0,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
            backgroundColor: "transparent",
            overflow: "hidden",
            elevation: 0,
            paddingHorizontal: 6,
            paddingTop: 0,
            paddingBottom: 0,
          },
          tabBarBackground: () => (
            <BlurView
              intensity={45}
              tint={theme === "dark" ? "dark" : "light"}
              experimentalBlurMethod="dimezisBlurView"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]}
            />
          ),
          tabBarShowLabel: false,
          tabBarItemStyle: {
            height: 50,
            paddingTop: 0,
            paddingBottom: 0,
            justifyContent: "center",
            alignItems: "center",
          },
          tabBarIconStyle: {
            marginTop: 0,
            marginBottom: 0,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarIcon: ({ color }) => (
            <View style={{ height: 50, width: "100%", alignItems: "center", justifyContent: "center" }}>
              <Feather name={TAB_ICONS[route.name]} size={19} color={color} />
            </View>
          ),
        })}
      >
        <Tabs.Screen name="Home" component={HomeScreen} options={{ tabBarItemStyle: { display: "none" } }} />
        <Tabs.Screen name="Notebooks" component={NotebooksScreen} />
        <Tabs.Screen name="Quick notes" component={QuickNotesScreen} />
        <Tabs.Screen name="Tasks" component={TasksScreen} />
        <Tabs.Screen name="Links" component={LinksScreen} />
      </Tabs.Navigator>
      <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} navigation={navigation} />
    </>
  );
}

function Root() {
  const { status } = useAuth();
  const { theme, colors } = useTheme();

  const navTheme = {
    ...(theme === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme === "dark" ? DarkTheme : DefaultTheme).colors,
      background: colors.surface0,
      card: colors.surface1,
      text: colors.textPrimary,
      border: colors.border,
      primary: colors.accent,
    },
  };

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface0 }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: "transparent" },
          headerBackground: () => (
            <BlurView
              intensity={50}
              tint={theme === "dark" ? "dark" : "light"}
              experimentalBlurMethod="dimezisBlurView"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }]}
            />
          ),
          headerTitleStyle: { color: colors.textPrimary, fontWeight: "500", fontSize: 16 },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
        }}
      >
        {status === "signedIn" ? (
          <>
            <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Notebook" component={NotebookScreen} options={({ route }: any) => ({ title: route.params.title })} />
            <Stack.Screen name="Page" component={PageEditorScreen} options={({ route }: any) => ({ title: route.params.title })} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  // Offline write queue: replay pending mutations when connectivity returns.
  useEffect(() => initOfflineSync(), []);
  useEffect(() => initNotifications(), []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <UnlockProvider>
              <Root />
            </UnlockProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
