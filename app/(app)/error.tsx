"use client";

import { useT } from "../i18n-provider";

export default function Error({ reset }: { reset: () => void }) {
  const { t } = useT();
  return (
    <div role="alert" className="anim-rise space-y-2 rounded-3xl border border-loss/40 bg-loss/10 p-5">
      <p>{t("err.boundary")}</p>
      <button onClick={reset} className="font-medium underline">{t("err.back")}</button>
    </div>
  );
}
