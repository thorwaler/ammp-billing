
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Customers from "./pages/Customers";
import Contracts from "./pages/Contracts";
import Calculator from "./pages/Calculator";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
import UserManagement from "./pages/UserManagement";
import ContractDetails from "./pages/ContractDetails";
import Integrations from "./pages/Integrations";

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/contracts" element={<Contracts />} />
      <Route path="/contracts/:id" element={<ContractDetails />} />
      <Route path="/calculator" element={<Calculator />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/users" element={<UserManagement />} />
      <Route path="/integrations" element={<Integrations />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

export default AppRoutes;
