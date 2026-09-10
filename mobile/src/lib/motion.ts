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
    duration: 300,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 240,
    },
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.88,
      duration: 300,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 200,
    },
  });
}

/** Softer exit when checking off a task (fade + collapse). */
export function animateTaskComplete() {
  configureMotion();
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
}

/** Springy reorder — cards glide into their new slots. */
export function animateReorder() {
  configureMotion();
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
}

/** Softer layout transition for expand/collapse panels. */
export function animatePanel() {
  configureMotion();
  LayoutAnimation.configureNext({
    duration: 300,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity, duration: 220 },
    update: { type: LayoutAnimation.Types.easeInEaseOut, duration: 300 },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity, duration: 200 },
  });
}
