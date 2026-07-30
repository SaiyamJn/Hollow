import AsyncStorage from "@react-native-async-storage/async-storage";

// Remembers where the user last was inside the notebook hierarchy so the
// floating "+" button can create things in the right place without asking.
export interface NavMemory {
  notebook?: { id: string; title: string };
  section?: { id: string; title: string; notebookId: string };
}

const KEY = "hollow-nav-memory";
let memory: NavMemory = {};

void AsyncStorage.getItem(KEY).then((raw) => {
  if (raw) {
    try {
      memory = { ...JSON.parse(raw), ...memory };
    } catch {
      // corrupt entry — start fresh
    }
  }
});

function persist() {
  void AsyncStorage.setItem(KEY, JSON.stringify(memory));
}

export function getNavMemory(): NavMemory {
  return memory;
}

export function rememberNotebook(id: string, title: string) {
  const section = memory.section?.notebookId === id ? memory.section : undefined;
  memory = { notebook: { id, title }, section };
  persist();
}

export function rememberSection(id: string, title: string, notebookId: string, notebookTitle?: string) {
  memory = {
    notebook:
      memory.notebook?.id === notebookId
        ? memory.notebook
        : { id: notebookId, title: notebookTitle ?? memory.notebook?.title ?? "" },
    section: { id, title, notebookId },
  };
  persist();
}
