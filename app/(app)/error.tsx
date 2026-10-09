"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="anim-rise space-y-2 rounded-3xl border border-loss/40 bg-loss/10 p-5">
      <p>Cette action n&apos;a pas pu être enregistrée. Vérifiez les champs saisis puis réessayez.</p>
      <button onClick={reset} className="font-medium underline">Revenir au formulaire</button>
    </div>
  );
}
