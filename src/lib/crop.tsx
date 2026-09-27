import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";
import { Image, LayoutChangeEvent, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

// Crop step for certificate photos. Any rectangle (not square-only like iOS's built-in editor).
// Usage: const crop = useCropper(); const uri = await crop({ uri, width, height }); // null = cancelled

type Photo = { uri: string; width: number; height: number };
type Rect = { x: number; y: number; w: number; h: number };
type Cropper = (photo: Photo) => Promise<string | null>;

const Ctx = createContext<Cropper>(async p => p.uri);
export const useCropper = () => useContext(Ctx);

const MIN = 60;       // smallest crop box, in screen points
const HANDLE = 44;    // touch target for each corner

export function CropProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const resolver = useRef<((uri: string | null) => void) | null>(null);

  const crop = useCallback<Cropper>(p => new Promise(resolve => {
    resolver.current = resolve;
    setPhoto(p);
  }), []);

  const finish = (uri: string | null) => {
    resolver.current?.(uri);
    resolver.current = null;
    setPhoto(null);
  };

  return (
    <Ctx.Provider value={crop}>
      {children}
      <Modal visible={!!photo} animationType="slide" onRequestClose={() => finish(null)}>
        {photo && <CropView photo={photo} onDone={finish} />}
      </Modal>
    </Ctx.Provider>
  );
}

function CropView({ photo, onDone }: { photo: Photo; onDone: (uri: string | null) => void }) {
  // Where the photo sits on screen ("contain" fit inside the available area).
  const [frame, setFrame] = useState<{ x: number; y: number; w: number; h: number; scale: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [saving, setSaving] = useState(false);
  const rectRef = useRef<Rect | null>(null);
  const frameRef = useRef(frame);
  rectRef.current = rect;
  frameRef.current = frame;

  const initial = (f: NonNullable<typeof frame>): Rect => {
    const ix = f.w * 0.06, iy = f.h * 0.06;
    return { x: f.x + ix, y: f.y + iy, w: f.w - 2 * ix, h: f.h - 2 * iy };
  };

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    const scale = Math.min(width / photo.width, height / photo.height);
    const w = photo.width * scale, h = photo.height * scale;
    const f = { x: (width - w) / 2, y: (height - h) / 2, w, h, scale };
    setFrame(f);
    setRect(initial(f));
  }

  // One drag handler per corner; "tl" = top-left, etc. Clamped to the photo and a minimum size.
  const corner = (which: "tl" | "tr" | "bl" | "br") => {
    let start: Rect;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { start = rectRef.current!; },
      onPanResponderMove: (_e, g) => {
        const f = frameRef.current!;
        let left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;
        if (which.includes("l")) left = Math.min(Math.max(f.x, start.x + g.dx), right - MIN);
        if (which.includes("r")) right = Math.max(Math.min(f.x + f.w, start.x + start.w + g.dx), left + MIN);
        if (which.includes("t")) top = Math.min(Math.max(f.y, start.y + g.dy), bottom - MIN);
        if (which.includes("b")) bottom = Math.max(Math.min(f.y + f.h, start.y + start.h + g.dy), top + MIN);
        setRect({ x: left, y: top, w: right - left, h: bottom - top });
      },
    });
  };
  const handles = useRef({ tl: corner("tl"), tr: corner("tr"), bl: corner("bl"), br: corner("br") }).current;

  async function done() {
    if (!frame || !rect) return;
    setSaving(true);
    try {
      // Screen box → pixels in the original photo.
      const originX = Math.max(0, Math.round((rect.x - frame.x) / frame.scale));
      const originY = Math.max(0, Math.round((rect.y - frame.y) / frame.scale));
      const width = Math.min(photo.width - originX, Math.round(rect.w / frame.scale));
      const height = Math.min(photo.height - originY, Math.round(rect.h / frame.scale));
      const ctx = ImageManipulator.manipulate(photo.uri);
      ctx.crop({ originX, originY, width, height });
      const img = await ctx.renderAsync();
      const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      onDone(out.uri);
    } catch {
      onDone(photo.uri); // if cropping fails, keep the full photo rather than losing it
    }
  }

  return (
    <View style={s.screen}>
      <Text style={s.title}>Crop to the certificate</Text>
      <Text style={s.help}>Drag the corners so only the certificate is inside the frame.</Text>
      <View style={{ flex: 1 }} onLayout={onLayout}>
        {frame && (
          <Image source={{ uri: photo.uri }} style={{ position: "absolute", left: frame.x, top: frame.y, width: frame.w, height: frame.h }} />
        )}
        {rect && (
          <>
            {/* Dim everything outside the crop box */}
            <View pointerEvents="none" style={[s.dim, { left: 0, right: 0, top: 0, height: rect.y }]} />
            <View pointerEvents="none" style={[s.dim, { left: 0, right: 0, top: rect.y + rect.h, bottom: 0 }]} />
            <View pointerEvents="none" style={[s.dim, { left: 0, width: rect.x, top: rect.y, height: rect.h }]} />
            <View pointerEvents="none" style={[s.dim, { left: rect.x + rect.w, right: 0, top: rect.y, height: rect.h }]} />
            <View pointerEvents="none" style={[s.box, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }]} />
            {(["tl", "tr", "bl", "br"] as const).map(k => (
              <View key={k} {...handles[k].panHandlers} style={[s.handleHit, {
                left: (k.includes("l") ? rect.x : rect.x + rect.w) - HANDLE / 2,
                top: (k.includes("t") ? rect.y : rect.y + rect.h) - HANDLE / 2,
              }]}>
                <View style={s.handle} />
              </View>
            ))}
          </>
        )}
      </View>
      <View style={s.bar}>
        <Pressable onPress={() => onDone(null)} style={s.btn}><Text style={s.btnText}>Cancel</Text></Pressable>
        <Pressable onPress={() => onDone(photo.uri)} style={s.btn}><Text style={s.btnText}>Use full photo</Text></Pressable>
        <Pressable onPress={done} disabled={saving} style={[s.btn, s.primary, saving && { opacity: 0.6 }]}>
          <Text style={[s.btnText, { fontWeight: "800" }]}>{saving ? "Saving…" : "Done"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000", paddingTop: 60 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" },
  help: { color: "#bbb", fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 12, paddingHorizontal: 24 },
  dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  box: { position: "absolute", borderWidth: 2, borderColor: "#fff" },
  handleHit: { position: "absolute", width: HANDLE, height: HANDLE, alignItems: "center", justifyContent: "center" },
  handle: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", borderWidth: 3, borderColor: "#2563EB" },
  bar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 36, gap: 10 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: "#1F2937" },
  primary: { backgroundColor: "#2563EB" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
