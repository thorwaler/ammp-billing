
import Layout from "@/components/layout/Layout";
import CustomerCard from "@/components/customers/CustomerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { PlusCircle, Search, Users } from "lucide-react";

const customersData = [
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
  {
    name: "Solaris Energy",
    location: "Arizona, USA",
    contractValue: "$48,000/MWp",
    mwpManaged: 28.7,
    status: "pending" as const,
    addOns: ["Monitoring", "Analytics", "Reporting"],
  },
  {
    name: "SunPeak Solar",
    location: "Nevada, USA",
    contractValue: "$40,000/MWp",
    mwpManaged: 22.3,
    status: "active" as const,
    addOns: ["Monitoring"],
  },
  {
    name: "EcoSun Power",
    location: "New Mexico, USA",
    contractValue: "$43,500/MWp",
    mwpManaged: 18.9,
    status: "inactive" as const,
    addOns: ["Monitoring"],
  },
  {
    name: "EnergySun Group",
    location: "Florida, USA",
    contractValue: "$46,000/MWp",
    mwpManaged: 15.4,
    status: "active" as const,
    addOns: ["Monitoring", "Analytics", "Maintenance"],
  },
];

const Customers = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCustomers = customersData.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center">
              <Users className="h-8 w-8 mr-2 text-ammp-blue" />
              Customers
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your customer portfolio and contracts
            </p>
          </div>
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            className="pl-8 max-w-md"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCustomers.map((customer) => (
            <CustomerCard key={customer.name} {...customer} />
          ))}
        </div>

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No customers found matching your search.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Customers;
