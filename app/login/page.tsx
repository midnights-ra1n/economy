import { redirect } from "next/navigation";
import { hasPasskey, isLoggedIn, isSetUp } from "@/lib/auth";
import { LoginForm, SetupForm } from "./passkey-forms";

export default async function LoginPage() {
  if (await isLoggedIn()) redirect("/");
  const setup = !isSetUp();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="anim-rise space-y-2">
        <p className="font-display text-2xl">Economy</p>
        <h1 className="font-display text-4xl leading-tight">{setup ? "Créez votre accès." : "Bon retour."}</h1>
        {setup && <p className="text-muted">Le code d&apos;initialisation s&apos;affiche dans les logs du serveur à chaque démarrage, tant qu&apos;aucun compte n&apos;existe.</p>}
      </div>
      {setup ? <SetupForm /> : <LoginForm passkeys={hasPasskey()} />}
    </main>
  );
}
