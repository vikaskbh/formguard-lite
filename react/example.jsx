// FormGuard React examples. Encode endpoints with: node tools/encode.js "<url>"
import { GuardedForm, Captcha, Honeypot, useFormGuard } from "formguard-lite/react";
// or copy react/FormGuard.jsx into your app: import { GuardedForm, Captcha } from "./FormGuard";

/* 1. Third-party endpoint (Maropost, Mailchimp…) via native post into a hidden iframe */
export function Newsletter() {
  return (
    <>
      <iframe name="mp_sink" title="subscription" style={{ display: "none" }} />
      <GuardedForm
        action="PASTE_ENCODED_ACTION" actionKey="PASTE_KEY"
        target="mp_sink" acceptCharset="UTF-8"
        success={<p>Thanks! Check your inbox in a few minutes.</p>}
      >
        <input name="contact_fields[first_name]" placeholder="First name" />
        <input name="contact_fields[email]" type="email" placeholder="Email" required />
        <input type="hidden" name="ref" value="999" />
        <Captcha />
        <button type="submit">Email me the report</button>
      </GuardedForm>
    </>
  );
}

/* 2. Your own API via fetch: onPass may be async; throw to show an error and allow retry */
export function Contact() {
  return (
    <GuardedForm
      action="PASTE_ENCODED_ACTION" actionKey="PASTE_KEY"
      onPass={async ({ url, formData }) => {
        const res = await fetch(url, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Couldn't send. Please try again.");
      }}
      onBlocked={(reason) => console.debug("FormGuard blocked:", reason)}
      success={<p>Message sent.</p>}
      guard={{ minTime: 4000, label: "Quick check: solve the sum" }}
    >
      {({ pending, locked }) => (
        <>
          <input name="name" required />
          <input name="email" type="email" required />
          <textarea name="message" required />
          <Captcha />
          <button type="submit" disabled={pending || locked}>{pending ? "Sending…" : "Send"}</button>
        </>
      )}
    </GuardedForm>
  );
}

/* 3. Headless hook with any form library (react-hook-form, Formik, your own) */
export function WithHook({ onValidSubmit }) {
  const guard = useFormGuard({ maxTries: 3 });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const r = guard.verify();
        if (r.ok) onValidSubmit(new FormData(e.currentTarget));
        // r.bot === true -> likely a bot (r.reason says why); pretend success if you like
      }}
    >
      <Honeypot guard={guard} />
      <input name="email" type="email" required />
      <Captcha guard={guard} />
      <button type="submit">Join</button>
    </form>
  );
}
