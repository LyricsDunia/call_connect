import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { CallProvider, useCallContext } from "@/contexts/CallContext";
import { CallOverlay } from "@/components/CallOverlay";

import LandingPage from "@/pages/landing";
import LobbyPage from "@/pages/lobby";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  const { currentUser } = useCallContext();
  return (
    <Switch>
      <Route path="/">
        {currentUser ? <Redirect to="/lobby" /> : <LandingPage />}
      </Route>
      <Route path="/lobby" component={LobbyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CallProvider>
          <WouterRouter base="">
            <Router />
            <CallOverlay />
          </WouterRouter>
          <Toaster />
        </CallProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
