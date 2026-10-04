// Sign in, create an account, confirm the email with a code, and reset a forgotten password.
// Emails carry a 6-digit code (not a link), so everything happens inside the app.
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { supabase, friendlyError } from "../lib/supabase";
import { Button, C, Card, ErrorText, Field, ui } from "../lib/ui";

type Mode = "signin" | "signup" | "confirm" | "forgot" | "reset";

const TITLES: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Create your account",
  confirm: "Confirm your email",
  forgot: "Reset your password",
  reset: "Choose a new password",
};

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const go = (m: Mode, note: string | null = null) => { setMode(m); setError(null); setNotice(note); setCode(""); };
  const cleanEmail = () => email.trim().toLowerCase();
  const cleanCode = () => code.replace(/\D/g, "");

  async function run(fn: () => Promise<void>) {
    setError(null); setNotice(null); setBusy(true);
    try { await fn(); } catch (e: any) { setError(friendlyError(e?.message ?? String(e))); }
    setBusy(false);
  }

  const checkEmail = () => { if (!cleanEmail().includes("@")) throw new Error("Enter a valid email."); };
  const checkPassword = () => { if (password.length < 8) throw new Error("Password must be at least 8 characters."); };
  const checkCode = () => { if (cleanCode().length < 6) throw new Error("Enter the 6-digit code from the email."); };

  const signIn = () => run(async () => {
    checkEmail(); checkPassword();
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail(), password });
    if (error && /not confirmed/i.test(error.message)) {
      await supabase.auth.resend({ type: "signup", email: cleanEmail() });
      return go("confirm", `Your email isn't confirmed yet. We sent a new code to ${cleanEmail()}.`);
    }
    if (error) throw error;
  });

  const signUp = () => run(async () => {
    checkEmail(); checkPassword();
    const { data, error } = await supabase.auth.signUp({ email: cleanEmail(), password });
    if (error) throw error;
    if (!data.session) go("confirm", `We sent a 6-digit code to ${cleanEmail()}.`);
  });

  const confirm = () => run(async () => {
    checkCode();
    let { error } = await supabase.auth.verifyOtp({ email: cleanEmail(), token: cleanCode(), type: "email" });
    if (error) ({ error } = await supabase.auth.verifyOtp({ email: cleanEmail(), token: cleanCode(), type: "signup" }));
    if (error) throw error;
    // Signed in: the app moves on to setup by itself.
  });

  const resendConfirm = () => run(async () => {
    const { error } = await supabase.auth.resend({ type: "signup", email: cleanEmail() });
    if (error) throw error;
    setNotice(`New code sent to ${cleanEmail()}.`);
  });

  const sendReset = () => run(async () => {
    checkEmail();
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail());
    if (error) throw error;
    go("reset", `If there's an account for ${cleanEmail()}, we sent it a 6-digit code.`);
  });

  const resetPassword = () => run(async () => {
    checkCode(); checkPassword();
    const { error } = await supabase.auth.verifyOtp({ email: cleanEmail(), token: cleanCode(), type: "recovery" });
    if (error) throw error;
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
  });

  const codeField = (
    <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code"
      textContentType="oneTimeCode" maxLength={10} placeholder="123456" />
  );

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[ui.wrap, { paddingTop: 80 }]} keyboardShouldPersistTaps="handled">
        <Text style={ui.brand}>CPE Keeper</Text>
        <Text style={[ui.muted, { fontSize: 15, marginBottom: 24 }]}>Every CPE credit, every state, in one place.</Text>
        <Card>
          <Text style={ui.h2}>{TITLES[mode]}</Text>
          {notice ? <Text style={[ui.muted, { marginBottom: 12, color: C.okText }]}>{notice}</Text> : null}

          {(mode === "signin" || mode === "signup" || mode === "forgot") && (
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email"
              keyboardType="email-address" placeholder="you@example.com" />
          )}
          {(mode === "confirm" || mode === "reset") && codeField}
          {(mode === "signin" || mode === "signup" || mode === "reset") && (
            <Field label={mode === "reset" ? "New password" : "Password"} value={password} onChangeText={setPassword} secureTextEntry
              autoComplete={mode === "signin" ? "password" : "new-password"} placeholder="At least 8 characters" />
          )}
          <ErrorText msg={error} />

          {mode === "signin" && (<>
            <Button title="Sign in" onPress={signIn} busy={busy} />
            <Button kind="link" title="Forgot password?" onPress={() => go("forgot")} />
            <Button kind="link" title="New here? Create an account" onPress={() => go("signup")} />
          </>)}
          {mode === "signup" && (<>
            <Button title="Create account" onPress={signUp} busy={busy} />
            <Button kind="link" title="Have an account? Sign in" onPress={() => go("signin")} />
          </>)}
          {mode === "confirm" && (<>
            <Button title="Confirm email" onPress={confirm} busy={busy} />
            <Button kind="link" title="Send a new code" onPress={resendConfirm} />
            <Button kind="link" title="Back to sign in" onPress={() => go("signin")} />
          </>)}
          {mode === "forgot" && (<>
            <Button title="Send reset code" onPress={sendReset} busy={busy} />
            <Button kind="link" title="Back to sign in" onPress={() => go("signin")} />
          </>)}
          {mode === "reset" && (<>
            <Button title="Save new password" onPress={resetPassword} busy={busy} />
            <Button kind="link" title="Send a new code" onPress={sendReset} />
            <Button kind="link" title="Back to sign in" onPress={() => go("signin")} />
          </>)}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
