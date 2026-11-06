import { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardBottomInset } from "../hooks/useKeyboardBottomInset";

interface KeyboardSafeProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** When true, wrap children in a ScrollView that can move above the keyboard. */
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Disable manual Android padding when the window already resizes via soft input */
  disableAndroidPadding?: boolean;
}

/**
 * Keeps focused inputs visible above the soft keyboard.
 * Uses measured keyboard height (reliable in Expo Go) plus iOS KeyboardAvoidingView.
 * For FlatList/SectionList screens, prefer `useKeyboardBottomInset` on contentContainerStyle.
 */
export function KeyboardSafe({
  children,
  style,
  scroll = false,
  contentContainerStyle,
  disableAndroidPadding = false,
}: KeyboardSafeProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardBottomInset();
  const bottomPad = (keyboardHeight > 0 ? keyboardHeight : 24) + (keyboardHeight > 0 ? 0 : insets.bottom);

  if (scroll) {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, style]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            contentContainerStyle,
            { paddingBottom: !disableAndroidPadding && Platform.OS === "android" ? bottomPad : insets.bottom + 16 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={false}
          decelerationRate={0.96}
          scrollEventThrottle={16}
          nestedScrollEnabled
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
    >
      <View
        style={[
          styles.flex,
          !disableAndroidPadding && Platform.OS === "android" && keyboardHeight > 0 && { paddingBottom: keyboardHeight },
        ]}
      >
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
