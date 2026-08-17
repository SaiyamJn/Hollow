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
    duration: 340,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 280,
    },
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.82,
      duration: 340,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 220,
    },
  });
}

/** Softer exit when checking off a task (fade + collapse). */
export function animateTaskComplete() {
  configureMotion();
  LayoutAnimation.configureNext({
    duration: 380,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 220,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
      duration: 380,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 320,
    },
  });
}

/** Springy reorder — cards glide into their new slots. */
export function animateReorder() {
  configureMotion();
  LayoutAnimation.configureNext({
    duration: 280,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 180,
    },
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.78,
      duration: 280,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 160,
    },
  });
}

/** Softer layout transition for expand/collapse panels. */
export function animatePanel() {
  configureMotion();
  LayoutAnimation.configureNext({
    duration: 380,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut, duration: 380 },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}
