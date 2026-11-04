import { LayoutAnimation, Platform, UIManager } from "react-native";

let configured = false;

/** Enable iOS / safe LayoutAnimation once (no-op on Android to avoid SectionList native crash). */
export function configureMotion() {
  if (configured) return;
  configured = true;
  // On Android, experimental LayoutAnimation with SectionList / VirtualizedList
  // causes native NullPointer / IllegalState crashes in View.layout(). Keep off on Android.
  if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    // Intentionally do NOT enable experimental LayoutAnimation on Android
  }
}

/** Smooth list insert/delete/reorder — call right before setState / mutation success. */
export function animateListChange() {
  if (Platform.OS === "android") return;
  configureMotion();
  try {
    LayoutAnimation.configureNext({
      duration: 240,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
        duration: 180,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
        duration: 240,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
        duration: 160,
      },
    });
  } catch {}
}

/** Softer exit when checking off a task (fade + collapse). */
export function animateTaskComplete() {
  if (Platform.OS === "android") return;
  configureMotion();
  try {
    LayoutAnimation.configureNext({
      duration: 320,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
        duration: 200,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
        duration: 320,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
        duration: 240,
      },
    });
  } catch {}
}

/** Springy reorder — cards glide into their new slots. */
export function animateReorder() {
  if (Platform.OS === "android") return;
  configureMotion();
  try {
    LayoutAnimation.configureNext({
      duration: 260,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
        duration: 160,
      },
      update: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.86,
        duration: 260,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
        duration: 150,
      },
    });
  } catch {}
}

/** Softer layout transition for expand/collapse panels. */
export function animatePanel() {
  if (Platform.OS === "android") return;
  configureMotion();
  try {
    LayoutAnimation.configureNext({
      duration: 300,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity, duration: 220 },
      update: { type: LayoutAnimation.Types.easeInEaseOut, duration: 300 },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity, duration: 200 },
    });
  } catch {}
}
