import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, isProfileComplete } from "@/lib/auth";
import { BottomNav } from "@/components/bottom-nav";
import { InstallPrompt } from "@/components/install-prompt";
import { Splash } from "@/routes/index";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, profile, profileLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (profileLoaded && !isProfileComplete(profile)) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [user, loading, profile, profileLoaded, navigate]);

  if (loading || !user || !profileLoaded || !isProfileComplete(profile)) {
    return <Splash />;
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <InstallPrompt />
      <BottomNav />
    </div>
  );
}
