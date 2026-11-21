import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireRole } from "./components/RequireRole";
import { ChainTickProvider } from "./hooks/useChainTick";
import { DirectoryProvider } from "./hooks/useDirectory";
import { ToastProvider } from "./hooks/useToast";
import { WalletProvider } from "./hooks/useWallet";
import AdminDashboard from "./pages/AdminDashboard";
import BatchDetail from "./pages/BatchDetail";
import DistributorDashboard from "./pages/DistributorDashboard";
import Landing from "./pages/Landing";
import ManufacturerDashboard from "./pages/ManufacturerDashboard";
import NotFound from "./pages/NotFound";
import PharmacyDashboard from "./pages/PharmacyDashboard";
import TxDetail from "./pages/TxDetail";
import Verify from "./pages/Verify";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ChainTickProvider>
        <ToastProvider>
          <WalletProvider>
            <DirectoryProvider>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Landing />} />
                  <Route path="verify" element={<Verify />} />
                  <Route path="verify/:batchId" element={<Verify />} />
                  <Route path="batch/:id" element={<BatchDetail />} />
                  <Route path="tx/:hash" element={<TxDetail />} />
                  <Route
                    path="admin"
                    element={
                      <RequireRole roles={["Regulator"]} allowAdmin>
                        <AdminDashboard />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="manufacturer"
                    element={
                      <RequireRole roles={["Manufacturer"]}>
                        <ManufacturerDashboard />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="distributor"
                    element={
                      <RequireRole roles={["Distributor"]}>
                        <DistributorDashboard />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="pharmacy"
                    element={
                      <RequireRole roles={["Pharmacy"]}>
                        <PharmacyDashboard />
                      </RequireRole>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </DirectoryProvider>
          </WalletProvider>
        </ToastProvider>
      </ChainTickProvider>
    </BrowserRouter>
  );
}
