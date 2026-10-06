// "Your state's rules": what counts as technical / non-technical, the limits, record keeping and sources —
// the reference behind the dashboard, in plain words. Opened from the dashboard (and the ⓘ on subject lines).
import { useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import type { Rules } from "../engine/engine";
import { STATE_NAMES } from "../rules";
import { C, Card, ui, themed } from "../lib/ui";
import { splitsTechnical } from "../lib/summary";

type Group = { category: string; title: string; items: string[] };

// The subject lists: the board's own wording when we have it (CA), otherwise the NASBA fields the app maps.
export function subjectGroups(rules: Rules): { intro?: string; source?: { label: string; url: string }; groups: Group[] } | null {
  if (rules.subjectGuide) return rules.subjectGuide;
  if (!splitsTechnical(rules)) return null;
  const m = rules.fieldOfStudyMap;
  return {
    intro: "Each course is sorted by the NASBA field of study printed on its certificate.",
    groups: [
      { category: "technical", title: "Technical", items: m.technical },
      { category: "non_technical", title: "Non-technical", items: m.non_technical },
    ],
  };
}

// "dca.ca.gov/cba/licensees/cequickref.shtml" — enough to tell several pages on one site apart.
const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

export default function StateRulesScreen({ state, rules, focus, onClose }: {
  state: string; rules: Rules; focus?: "subjects"; onClose: () => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const name = STATE_NAMES[state] ?? state;
  const guide = subjectGroups(rules);
  // A category's name: the board label if set, else the requirement that uses it alone (CA "Ethics"), else tidied.
  const label = (c: string) => rules.categoryLabels?.[c]
    ?? rules.requirements.find(q => q.categories?.length === 1 && q.categories[0] === c)?.label
    ?? c.replace(/_/g, " ").replace(/^./, x => x.toUpperCase());
  const shown = new Set(["general", ...(guide?.groups.map(g => g.category) ?? [])]);
  // Other ways courses are sorted (A&A, tax, state ethics, self-study…), so the dashboard lines make sense.
  const others = [
    ...Object.entries(rules.fieldOfStudyMap).filter(([c]) => !shown.has(c))
      .map(([c, fields]) => ({ title: label(c), text: `Field of study: ${fields.join(", ")}` })),
    ...Object.entries(rules.titleKeywordMap ?? {}).filter(([c]) => !shown.has(c))
      .map(([c, keys]) => ({ title: label(c), text: `Courses with ${keys.map(k => k.split("+").map(w => `"${w}"`).join(" and ")).join(", or ")} in the title` })),
    ...Object.entries(rules.deliveryMap ?? {})
      .map(([c, formats]) => ({ title: label(c), text: `Delivery format: ${formats.join(", ")}` })),
  ];
  const limits = rules.requirements.filter(q => q.kind === "max");
  // The board-wording source first; a page listed twice (CA: also in sourceUrls) shows once.
  const sources = [...(guide?.source ? [guide.source] : []), ...(rules.sourceUrls ?? []).map(u => ({ label: host(u), url: u }))]
    .filter((src, i, all) => all.findIndex(x => x.url === src.url) === i);

  const Section = ({ title, children, onLayout }: { title: string; children: React.ReactNode; onLayout?: (y: number) => void }) => (
    <View onLayout={e => onLayout?.(e.nativeEvent.layout.y)}>
      <Text style={ui.h2}>{title}</Text>
      <Card>{children}</Card>
    </View>
  );
  const Bullets = ({ items }: { items: string[] }) => (
    <>{items.map((t, i) => (
      <View key={i} style={s.bulletRow}><Text style={s.bullet}>•</Text><Text style={[s.body, { flex: 1 }]}>{t}</Text></View>
    ))}</>
  );

  return (
    <ScrollView ref={scroll} style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]}>
      <Pressable onPress={onClose} hitSlop={10}><Text style={s.back}>‹ Back</Text></Pressable>
      <Text style={[ui.brand, { marginBottom: 2 }]}>{name} CPE rules</Text>
      {rules.board ? <Text style={[ui.muted, { marginBottom: 16 }]}>{rules.board}</Text> : null}

      <Section title="How it works">
        {rules.cycle.note ? <Text style={s.body}>{rules.cycle.note}</Text> : null}
        {rules.newLicensee?.note ? <Text style={[s.body, { marginTop: 8 }]}><Text style={s.bold}>New licensees: </Text>{rules.newLicensee.note}</Text> : null}
      </Section>

      <Section title={guide ? "Technical and non-technical subjects" : "Which subjects count"}
        onLayout={y => { if (focus === "subjects") setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: false }), 0); }}>
        {guide ? (<>
          {guide.groups.map((g, i) => (
            <View key={g.category} style={i > 0 && { marginTop: 12 }}>
              <Text style={s.subTitle}>{g.title}</Text>
              <Bullets items={g.items} />
            </View>
          ))}
          {guide.intro ? <Text style={[ui.hint, { marginTop: 10 }]}>{guide.intro}</Text> : null}
          <Text style={[ui.hint, { marginTop: 6 }]}>"Technical or non-technical" in What you still need means those hours can be in either.</Text>
        </>) : (
          <Text style={s.body}>{name} doesn't split technical and non-technical hours: any course in a recognized field of study counts toward your total ("Any CPE subject"), within the limits below.</Text>
        )}
      </Section>

      {others.length > 0 && (
        <Section title="How courses are sorted">
          {others.map((o, i) => (
            <View key={o.title + i} style={i > 0 && { marginTop: 10 }}>
              <Text style={s.subTitle}>{o.title}</Text>
              <Text style={s.body}>{o.text}</Text>
            </View>
          ))}
          <Text style={[ui.hint, { marginTop: 10 }]}>You can change a course's field of study or delivery format by tapping it on the Courses tab.</Text>
        </Section>
      )}

      {limits.length > 0 && (
        <Section title="Limits">
          {limits.map((q, i) => (
            <View key={q.id} style={i > 0 && { marginTop: 10 }}>
              <Text style={s.subTitle}>{q.label}: up to {q.hours} hrs</Text>
              {q.note ? <Text style={s.body}>{q.note.replace(/^Maximum, not a target\.\s*/, "")}</Text> : null}
            </View>
          ))}
        </Section>
      )}

      {(rules.limitsNotTracked?.length || rules.recordRetention) ? (
        <Section title="Also in the rules">
          {rules.limitsNotTracked?.length ? (<>
            <Text style={[ui.hint, { marginTop: 0, marginBottom: 4 }]}>The app doesn't count these for you:</Text>
            <Bullets items={rules.limitsNotTracked} />
          </>) : null}
          {rules.recordRetention ? <Text style={[s.body, rules.limitsNotTracked?.length ? { marginTop: 10 } : null]}><Text style={s.bold}>Records: </Text>{rules.recordRetention}</Text> : null}
        </Section>
      ) : null}

      {sources.length > 0 && (
        <Section title="Sources">
          {sources.map((src, i) => (
            <Pressable key={i} onPress={() => WebBrowser.openBrowserAsync(src.url)} accessibilityRole="link"
              style={({ pressed }) => [s.linkRow, i > 0 && s.border, pressed && { opacity: 0.6 }]}>
              <Text style={s.link} numberOfLines={1} ellipsizeMode="middle">{src.label}</Text>
              <Text style={{ color: C.muted }}>›</Text>
            </Pressable>
          ))}
        </Section>
      )}

      <Text style={[ui.hint, { marginTop: 4 }]}>CPE Keeper follows the board's published rules, but your board has the final word. Confirm your requirements with it before you renew.</Text>
    </ScrollView>
  );
}

const s = themed(() => ({
  back: { color: C.accent, fontWeight: "600", marginBottom: 12 },
  body: { color: C.ink, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  bold: { fontWeight: "700" },
  subTitle: { color: C.ink, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  bulletRow: { flexDirection: "row", marginTop: 3 },
  bullet: { color: C.muted, width: 14, fontSize: 14, lineHeight: 20 },
  linkRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, gap: 8 },
  border: { borderTopWidth: 1, borderTopColor: C.line },
  link: { color: C.accent, fontSize: 15, flexShrink: 1 },
}));
