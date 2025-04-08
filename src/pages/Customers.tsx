
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import CustomerCard from "@/components/customers/CustomerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Search, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import CustomerForm from "@/components/customers/CustomerForm";

const customersData = [
  {
    id: "cust-001",
    name: "Solar Universe Inc.",
    location: "California, USA",
    contractValue: "$45,000/MWp",
    mwpManaged: 42.5,
    status: "active" as const,
    addOns: ["Monitoring", "Analytics"],
    joinDate: "2023-05-15",
    lastInvoiced: "2023-09-10",
    contractId: "1"
  },
  {
    id: "cust-002",
    name: "GreenPower Systems",
    location: "Texas, USA",
    contractValue: "$42,500/MWp",
    mwpManaged: 35.2,
    status: "active" as const,
    addOns: ["Monitoring", "Maintenance"],
    joinDate: "2023-06-20",
    lastInvoiced: "2023-09-15",
    contractId: "2"
  },
  {
    id: "cust-003",
    name: "Solaris Energy",
    location: "Arizona, USA",
    contractValue: "$48,000/MWp",
    mwpManaged: 28.7,
    status: "pending" as const,
    addOns: ["Monitoring", "Analytics", "Reporting"],
    joinDate: "2023-07-08",
    lastInvoiced: "2023-09-01",
    contractId: "3"
  },
  {
    id: "cust-004",
    name: "SunPeak Solar",
    location: "Nevada, USA",
    contractValue: "$40,000/MWp",
    mwpManaged: 22.3,
    status: "active" as const,
    addOns: ["Monitoring"],
    joinDate: "2023-04-30",
    lastInvoiced: "2023-08-15",
    contractId: "4"
  },
  {
    id: "cust-005",
    name: "EcoSun Power",
    location: "New Mexico, USA",
    contractValue: "$43,500/MWp",
    mwpManaged: 18.9,
    status: "inactive" as const,
    addOns: ["Monitoring"],
    joinDate: "2022-11-10",
    lastInvoiced: "2023-07-31",
    contractId: "5"
  },
  {
    id: "cust-006",
    name: "EnergySun Group",
    location: "Florida, USA",
    contractValue: "$46,000/MWp",
    mwpManaged: 15.4,
    status: "active" as const,
    addOns: ["Monitoring", "Analytics", "Maintenance"],
    joinDate: "2023-02-28",
    lastInvoiced: "2023-08-28",
    contractId: "6"
  },
];

const Customers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const navigate = useNavigate();

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
          <Dialog open={showAddCustomerForm} onOpenChange={setShowAddCustomerForm}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
              </DialogHeader>
              <CustomerForm onComplete={() => setShowAddCustomerForm(false)} />
            </DialogContent>
          </Dialog>
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
            <CustomerCard 
              key={customer.id} 
              {...customer} 
              onViewContract={() => navigate(`/contracts/${customer.contractId}`)} 
              onViewDetails={() => navigate(`/customers/${customer.id}`)} 
            />
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
