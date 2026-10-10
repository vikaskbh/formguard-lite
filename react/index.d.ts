import * as React from "react";

export type BlockReason = "honeypot" | "too-fast" | "no-interaction" | "webdriver";
export type VerifyResult =
  | { ok: true }
  | { ok: false; bot: true; reason: BlockReason }
  | { ok: false; bot?: false; reason: "wrong" | "locked" | "unsolved" };

export interface GuardOptions {
  /** ms the form must exist before a submit is believed (default 3000) */
  minTime?: number;
  /** human events required before submit (default 2) */
  minInteractions?: number;
  /** wrong captcha answers before lock (default 4) */
  maxTries?: number;
  /** render/require the canvas puzzle (default true) */
  captcha?: boolean;
  /** honeypot field name, "" disables (default "website") */
  honeypot?: string;
  label?: string;
  errWrong?: string;
  errLocked?: string;
}

export interface Guard {
  verify(): VerifyResult;
  refresh(): void;
  error: string;
  setError(msg: string): void;
  locked: boolean;
  honeypotName: string;
  options: Required<GuardOptions>;
}

export function useFormGuard(options?: GuardOptions): Guard;
export function Honeypot(props: { guard?: Guard }): JSX.Element | null;
export function Captcha(props: { guard?: Guard; className?: string; style?: React.CSSProperties }): JSX.Element | null;

export interface PassArgs { url: string; formData: FormData; form: HTMLFormElement }
export interface RenderState { pending: boolean; error: string; locked: boolean; guard: Guard }

export interface GuardedFormProps
  extends Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit" | "children"> {
  /** encoded endpoint from tools/encode.(js|html) */
  action?: string;
  /** key used when encoding */
  actionKey?: string;
  /** unencoded endpoint (same-origin / non-secret) */
  plainAction?: string;
  /** send it yourself; omit for a native post. Throw to show an error and allow retry. */
  onPass?: (args: PassArgs) => void | Promise<void>;
  onBlocked?: (reason: BlockReason) => void;
  onSuccess?: () => void;
  /** rendered in place of the form after success */
  success?: React.ReactNode;
  /** bots see success instead of an error (default true) */
  silent?: boolean;
  guard?: GuardOptions;
  children?: React.ReactNode | ((state: RenderState) => React.ReactNode);
}
export function GuardedForm(props: GuardedFormProps): JSX.Element;

export function encode(url: string, key: string): string;
export function decode(encoded: string, key: string): string;

declare const FormGuard: {
  GuardedForm: typeof GuardedForm;
  useFormGuard: typeof useFormGuard;
  Captcha: typeof Captcha;
  Honeypot: typeof Honeypot;
  encode: typeof encode;
  decode: typeof decode;
  version: string;
};
export default FormGuard;
