import { useEffect, useState } from "react";
import { ActivityIndicator, InteractionManager, Platform, Pressable, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ThemeProvider, useTheme } from "./src/contexts/theme";
import { FontProvider, useFont } from "./src/contexts/font";
import { AuthProvider, useAuth } from "./src/contexts/auth";
import { UnlockProvider } from "./src/contexts/unlock";
import { initOfflineSync } from "./src/lib/api";
import { initNotifications } from "./src/lib/notifications";
import { TAB_BAR_HEIGHT, useLayout } from "./src/lib/layout";
import { SearchModal } from "./src/components/SearchModal";
import HomeScreen from "./src/screens/HomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import NotebooksScreen from "./src/screens/NotebooksScreen";
import NotebookScreen from "./src/screens/NotebookScreen";
import PageEditorScreen from "./src/screens/PageEditorScreen";
import QuickNotesScreen from "./src/screens/QuickNotesScreen";
import QuickNoteDetailScreen from "./src/screens/QuickNoteDetailScreen";
import TasksScreen from "./src/screens/TasksScreen";
import LinksScreen from "./src/screens/LinksScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

export type RootStackParamList = {
  Tabs: undefined;
  Notebook: { notebookId: string; title: string };
  Page: { pageId: string; sectionId: string; notebookId: string; title: string };
  QuickNote: { noteId: string; content?: string; color?: string };
  Settings: undefined;
  Login: undefined;
  Register: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/** Blur is expensive on Android first paint — use a solid glass tint instead. */
function GlassChrome({ intensity = 50 }: { intensity?: number }) {
  const { theme, colors } = useTheme();
  if (Platform.OS === "android") {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme === "dark" ? "rgba(22, 24, 27, 0.94)" : "rgba(255, 255, 255, 0.94)",
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.glassBorder,
          },
        ]}
      />
    );
  }
  return (
    <BlurView
      intensity={intensity}
      tint={theme === "dark" ? "dark" : "light"}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: colors.glass,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.glassBorder,
        },
      ]}
    />
  );
}

function TabBarChrome() {
  const { theme, colors } = useTheme();
  if (Platform.OS === "android") {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme === "dark" ? "rgba(22, 24, 27, 0.96)" : "rgba(255, 255, 255, 0.96)" },
        ]}
      />
    );
  }
  return (
    <BlurView
      intensity={45}
      tint={theme === "dark" ? "dark" : "light"}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]}
    />
  );
}

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Home: "home",
  Notebooks: "book",
  "Quick notes": "file-text",
  Tasks: "check-square",
  Links: "share-2",
};

function MainTabs({ navigation }: any) {
  const { theme, colors } = useTheme();
  const { isNarrow, tabBarBottom, tabBarMarginH } = useLayout();
  const [searchOpen, setSearchOpen] = useState(false);
  const headerPad = isNarrow ? 8 : 16;
  return (
    <>
      <Tabs.Navigator
        screenOptions={({ route, navigation: tabNav }) => ({
          headerStyle: { backgroundColor: "transparent" },
          headerBackground: () => <GlassChrome />,
          headerTitleStyle: {
            color: colors.textPrimary,
            fontWeight: "500",
            fontSize: isNarrow ? 15 : 16,
          },
          headerTitleAlign: "center",
          headerShadowVisible: false,
          // Home isn't in the tab bar — every other tab gets a back arrow to it.
          headerLeft:
            route.name === "Home"
              ? undefined
              : () => (
                  <Pressable
                    onPress={() => tabNav.navigate("Home")}
                    style={{ paddingLeft: headerPad, paddingRight: 6 }}
                  >
                    <Feather name="arrow-left" size={20} color={colors.textPrimary} />
                  </Pressable>
                ),
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Pressable onPress={() => setSearchOpen(true)} style={{ paddingHorizontal: isNarrow ? 8 : 10 }}>
                <Feather name="search" size={18} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("Settings")}
                style={{ paddingLeft: isNarrow ? 6 : 10, paddingRight: headerPad }}
              >
                <Feather name="settings" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          ),
          // Floating glass pill — margin scales down on narrow phones.
          tabBarStyle: {
            position: "absolute",
            bottom: tabBarBottom,
            marginHorizontal: tabBarMarginH,
            height: TAB_BAR_HEIGHT,
            borderRadius: TAB_BAR_HEIGHT / 2,
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
          tabBarBackground: () => <TabBarChrome />,
          lazy: true,
          tabBarShowLabel: false,
          tabBarItemStyle: {
            height: TAB_BAR_HEIGHT,
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
            <View style={{ height: TAB_BAR_HEIGHT, width: "100%", alignItems: "center", justifyContent: "center" }}>
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
  const { fontsReady, fontFamily } = useFont();

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

  if (status === "loading" || !fontsReady) {
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
          headerBackground: () => <GlassChrome />,
          headerTitleStyle: {
            color: colors.textPrimary,
            fontWeight: "500",
            fontSize: 16,
            ...(fontFamily ? { fontFamily } : null),
          },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
        }}
      >
        {status === "signedIn" ? (
          <>
            <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Notebook" component={NotebookScreen} options={({ route }: any) => ({ title: route.params.title })} />
            <Stack.Screen name="Page" component={PageEditorScreen} options={({ route }: any) => ({ title: route.params.title })} />
            <Stack.Screen name="QuickNote" component={QuickNoteDetailScreen} options={{ title: "Note" }} />
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
  // Defer offline replay + notifications until after first interactions so
  // they don't compete with auth restore / Home queries on cold start.
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      initOfflineSync();
      void initNotifications();
    });
    return () => handle.cancel();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FontProvider>
            <AuthProvider>
              <UnlockProvider>
                <Root />
              </UnlockProvider>
            </AuthProvider>
          </FontProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
