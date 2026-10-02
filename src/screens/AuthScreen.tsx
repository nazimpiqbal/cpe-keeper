import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { supabase, friendlyError } from "../lib/supabase";
import { Button, C, Card, ErrorText, Field, ui } from "../lib/ui";

export default function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setError(null); setNotice(null);
    if (!email.includes("@")) return setError("Enter a valid email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    const { data, error } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(friendlyError(error.message));
    if (mode === "signup" && !data.session) setNotice("Account created. Check your email for a confirmation link, then sign in.");
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[ui.wrap, { paddingTop: 80 }]} keyboardShouldPersistTaps="handled">
        <Text style={ui.brand}>CPE Keeper</Text>
        <Text style={[ui.muted, { fontSize: 15, marginBottom: 24 }]}>Every CPE credit, every state, in one place.</Text>
        <Card>
          <Text style={ui.h2}>{mode === "signin" ? "Sign in" : "Create your account"}</Text>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "signin" ? "password" : "new-password"} placeholder="At least 8 characters" />
          <ErrorText msg={error} />
          {notice ? <Text style={[ui.muted, { marginBottom: 8, color: C.okText }]}>{notice}</Text> : null}
          <Button title={mode === "signin" ? "Sign in" : "Create account"} onPress={submit} busy={busy} />
          <Button kind="link" title={mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
            onPress={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
