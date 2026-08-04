import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** Measured soft-keyboard height — works in Expo Go where window-resize often doesn't. */
export function useKeyboardBottomInset(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const onHide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return height;
}
