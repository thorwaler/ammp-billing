
import { useState } from "react";
import Layout from "@/components/layout/Layout";
import StatCard from "@/components/dashboard/StatCard";
import ContractUploader from "@/components/dashboard/ContractUploader";
import RecentActivity from "@/components/dashboard/RecentActivity";
import CustomerCard from "@/components/customers/CustomerCard";
import InvoiceCalculator from "@/components/dashboard/InvoiceCalculator";
import { Users, FileText, BarChart4, DollarSign } from "lucide-react";

const customers = [
  {
    name: "Solar Universe Inc.",
    location: "California, USA",
    contractValue: "$45,000/MWp",
    mwpManaged: 42.5,
    status: "active" as const,
    addOns: ["Monitoring", "Analytics"],
  },
  {
    name: "GreenPower Systems",
    location: "Texas, USA",
    contractValue: "$42,500/MWp",
    mwpManaged: 35.2,
    status: "active" as const,
    addOns: ["Monitoring", "Maintenance"],
  },
];

const Index = () => {
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Welcome to AMMP Contract Compass. Manage your contracts, customers and invoices.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Customers"
            value="12"
            icon={Users}
            trend="up"
            trendValue="+2 this month"
          />
          <StatCard
            title="Active Contracts"
            value="28"
            icon={FileText}
            trend="up"
            trendValue="+3 this month"
          />
          <StatCard
            title="Total MWp Managed"
            value="254.8"
            icon={BarChart4}
            trend="up"
            trendValue="+15.3 this month"
          />
          <StatCard
            title="Monthly Revenue"
            value="$32,450"
            icon={DollarSign}
            trend="up"
            trendValue="+8% vs last month"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <ContractUploader />
          </div>
          <div>
            <RecentActivity />
          </div>
        </div>

        {/* Customers and Calculator */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <div>
              <h2 className="text-xl font-semibold mb-4">Key Customers</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customers.map((customer) => (
                  <CustomerCard key={customer.name} {...customer} />
                ))}
              </div>
            </div>
          </div>
          <div>
            <InvoiceCalculator />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Index;
