import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ThemeProvider, useTheme } from "./src/contexts/theme";
import { FontProvider, useFont } from "./src/contexts/font";
import { FocusColorsProvider } from "./src/contexts/focusColors";
import { AuthProvider, useAuth } from "./src/contexts/auth";
import { UnlockProvider } from "./src/contexts/unlock";
import { initOfflineSync } from "./src/lib/api";
import { initNotifications } from "./src/lib/notifications";
import { configureMotion } from "./src/lib/motion";
import { useLayout } from "./src/lib/layout";
import { SearchModal } from "./src/components/SearchModal";
import { HollowTabBar } from "./src/components/HollowTabBar";
import { HollowStackHeader } from "./src/components/HollowStackHeader";
import HomeScreen from "./src/screens/HomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import NotebooksScreen from "./src/screens/NotebooksScreen";
import NotebookScreen from "./src/screens/NotebookScreen";
import PageEditorScreen from "./src/screens/PageEditorScreen";
import QuickNotesScreen from "./src/screens/QuickNotesScreen";
import QuickNoteDetailScreen from "./src/screens/QuickNoteDetailScreen";
import RecycleBinScreen from "./src/screens/RecycleBinScreen";
import TasksScreen from "./src/screens/TasksScreen";
import LinksScreen from "./src/screens/LinksScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import DevicesScreen from "./src/screens/DevicesScreen";
import { CalendarScreen } from "./src/calendar";

export type RootStackParamList = {
  Tabs: undefined;
  Notebook: { notebookId: string; title: string };
  Page: { pageId: string; sectionId: string; notebookId: string; title: string };
  QuickNote: { noteId: string; title?: string; content?: string; color?: string; kind?: "note" | "list" };
  RecycleBin: undefined;
  Settings: undefined;
  Devices: undefined;
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

/** Top inset that clears the system status bar on all Android variants. */
function useStatusBarInset() {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== "android") return insets.top;
  return Math.max(insets.top, RNStatusBar.currentHeight ?? 0, 24);
}

/**
 * Header chrome. Android BlurView (dimezis) can ghost previous frames into the
 * header (e.g. calendar "August 2026") — use a solid bar there instead.
 */
function GlassChrome() {
  const { theme, colors } = useTheme();
  if (Platform.OS === "android") {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme === "dark" ? "#0f1012" : "#f4f5f7",
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.glassBorder,
          },
        ]}
      />
    );
  }
  return (
    <BlurView
      intensity={50}
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

function MainTabs({ navigation }: any) {
  const { colors } = useTheme();
  const { isNarrow } = useLayout();
  const statusBarInset = useStatusBarInset();
  const [searchOpen, setSearchOpen] = useState(false);
  const headerPad = isNarrow ? 8 : 16;
  // Content height below the status bar — keep titles/actions fully visible.
  const headerContentH = 48;

  return (
    <>
      <Tabs.Navigator
        tabBar={(props) => <HollowTabBar {...props} />}
        screenOptions={({ route, navigation: tabNav }) => ({
          headerStyle: {
            backgroundColor: Platform.OS === "android" ? (colors.surface0 as string) : "transparent",
            height: statusBarInset + headerContentH,
            elevation: 0,
            shadowOpacity: 0,
          },
          headerBackground: () => <GlassChrome />,
          headerStatusBarHeight: statusBarInset,
          headerTitleContainerStyle: {
            paddingVertical: 0,
          },
          headerTitleStyle: {
            color: colors.textPrimary,
            fontWeight: "500",
            fontSize: isNarrow ? 15 : 16,
          },
          headerTitleAlign: "center",
          headerShadowVisible: false,
          headerLeft:
            route.name === "Home"
              ? undefined
              : () => (
                  <Pressable
                    onPress={() => tabNav.navigate("Home")}
                    style={{ paddingLeft: headerPad, paddingRight: 6, height: 44, justifyContent: "center" }}
                    hitSlop={8}
                  >
                    <Feather name="arrow-left" size={20} color={colors.textPrimary} />
                  </Pressable>
                ),
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center", height: 44 }}>
              <Pressable
                onPress={() => setSearchOpen(true)}
                style={{ paddingHorizontal: isNarrow ? 8 : 10, height: 44, justifyContent: "center" }}
                hitSlop={8}
              >
                <Feather name="search" size={18} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("Settings")}
                style={{
                  paddingLeft: isNarrow ? 6 : 10,
                  paddingRight: headerPad,
                  height: 44,
                  justifyContent: "center",
                }}
                hitSlop={8}
              >
                <Feather name="settings" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          ),
          lazy: true,
        })}
      >
        <Tabs.Screen name="Home" component={HomeScreen} options={{ title: "Hollow" }} />
        <Tabs.Screen name="Notebooks" component={NotebooksScreen} />
        <Tabs.Screen name="Quick notes" component={QuickNotesScreen} options={{ title: "Notes" }} />
        <Tabs.Screen name="Calendar" component={CalendarScreen} />
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
      <StatusBar style={theme === "dark" ? "light" : "dark"} translucent backgroundColor="transparent" />
      {Platform.OS === "android" && (
        <RNStatusBar
          translucent
          backgroundColor="transparent"
          barStyle={theme === "dark" ? "light-content" : "dark-content"}
        />
      )}
      <Stack.Navigator
        screenOptions={{
          contentStyle: { backgroundColor: colors.surface0 },
          // Custom header pads below the status bar on device (Expo web is fine either way).
          header: (props) => <HollowStackHeader {...props} />,
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleAlign: "center",
          headerTitleStyle: fontFamily ? { fontFamily } : undefined,
          animation: "slide_from_right",
          animationDuration: 320,
        }}
      >
        {status === "signedIn" ? (
          <>
            <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen
              name="Notebook"
              component={NotebookScreen}
              options={({ route }: any) => ({ title: route.params.title })}
            />
            <Stack.Screen
              name="Page"
              component={PageEditorScreen}
              options={({ route }: any) => ({ title: route.params.title })}
            />
            <Stack.Screen name="QuickNote" component={QuickNoteDetailScreen} options={{ title: "Note" }} />
            <Stack.Screen name="RecycleBin" component={RecycleBinScreen} options={{ title: "Recycle bin" }} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Devices" component={DevicesScreen} options={{ title: "Devices" }} />
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
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      configureMotion();
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
            <FocusColorsProvider>
              <AuthProvider>
                <UnlockProvider>
                  <Root />
                </UnlockProvider>
              </AuthProvider>
            </FocusColorsProvider>
          </FontProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
