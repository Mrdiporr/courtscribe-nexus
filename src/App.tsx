import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useAutoSync } from "@/hooks/useAutoSync";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ConnectivityBanner } from "@/components/ConnectivityBanner";
import Index from "./pages/Index";
import NewSession from "./pages/NewSession";
import Recording from "./pages/Recording";
import Review from "./pages/Review";
import Settings from "./pages/Settings";
import Cases from "./pages/Cases";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AutoSyncProvider({ children }: { children: React.ReactNode }) {
  useAutoSync();
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AutoSyncProvider>
            <ConnectivityBanner />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/new-session" element={<ProtectedRoute><NewSession /></ProtectedRoute>} />
              <Route path="/record/:sessionId" element={<ProtectedRoute><Recording /></ProtectedRoute>} />
              <Route path="/review/:sessionId" element={<ProtectedRoute><Review /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/cases" element={<ProtectedRoute><Cases /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AutoSyncProvider>

        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
