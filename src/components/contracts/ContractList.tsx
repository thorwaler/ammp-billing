
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FileText, Download, Search } from "lucide-react";

interface Contract {
  id: string;
  customer: string;
  contractValue: string;
  addOns: string[];
  uploadDate: string;
  status: "active" | "pending" | "expired";
}

const contracts: Contract[] = [
  {
    id: "CON-001",
    customer: "Solar Universe Inc.",
    contractValue: "$45,000/MWp",
    addOns: ["Monitoring", "Analytics"],
    uploadDate: "2023-03-15",
    status: "active",
  },
  {
    id: "CON-002",
    customer: "GreenPower Systems",
    contractValue: "$42,500/MWp",
    addOns: ["Monitoring", "Maintenance"],
    uploadDate: "2023-04-02",
    status: "active",
  },
  {
    id: "CON-003",
    customer: "Solaris Energy",
    contractValue: "$48,000/MWp",
    addOns: ["Monitoring", "Analytics", "Reporting"],
    uploadDate: "2023-05-10",
    status: "pending",
  },
  {
    id: "CON-004",
    customer: "SunPeak Solar",
    contractValue: "$40,000/MWp",
    addOns: ["Monitoring"],
    uploadDate: "2022-11-20",
    status: "expired",
  },
];

export function ContractList() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredContracts = contracts.filter(
    (contract) =>
      contract.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contract.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <FileText className="h-5 w-5 text-ammp-blue" />
          Contracts
        </CardTitle>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contracts..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Contract Value</TableHead>
                <TableHead>Add-ons</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-medium">{contract.id}</TableCell>
                  <TableCell>{contract.customer}</TableCell>
                  <TableCell>{contract.contractValue}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contract.addOns.map((addon) => (
                        <Badge key={addon} variant="outline" className="text-xs">
                          {addon}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        contract.status === "active"
                          ? "default"
                          : contract.status === "pending"
                          ? "outline"
                          : "secondary"
                      }
                    >
                      {contract.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default ContractList;
