import { Button } from "@heroui/react";
import { UserRole } from "@supershop/shared";
import { AuthStatus } from "@/components/auth-status";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start gap-6 p-10">
      <header className="flex w-full items-center justify-between">
        <h1 className="text-3xl font-bold">Supershop Management System</h1>
        <AuthStatus />
      </header>
      <p className="text-default-500">
        Phase 2: Supabase auth (frontend) + JWT/JWKS verification, RBAC and store-scope guards
        (backend). Roles are defined in <code>@supershop/shared</code>:
      </p>
      <ul className="list-disc pl-6">
        {Object.values(UserRole).map((role) => (
          <li key={role}>{role}</li>
        ))}
      </ul>
      <Button variant="primary">HeroUI button</Button>
    </main>
  );
}
