import { Button } from "@heroui/react";
import { UserRole } from "@supershop/shared";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start gap-6 p-10">
      <h1 className="text-3xl font-bold">Supershop Management System</h1>
      <p className="text-default-500">
        Phase 0 foundation is up. Roles are defined once in <code>@supershop/shared</code> and
        imported here (proving the shared package works across apps):
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
