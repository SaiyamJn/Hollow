import { LayoutAnimation, Platform, UIManager } from "react-native";

let configured = false;

/** Enable Android LayoutAnimation once (no-op on iOS / web). */
export function configureMotion() {
  if (configured) return;
  configured = true;
  if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

/** Smooth list insert/delete/reorder — call right before setState / mutation success. */
export function animateListChange() {
  configureMotion();
  LayoutAnimation.configureNext({
    duration: 280,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}
