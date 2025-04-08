
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { FileText, Download, Search, MoreHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ContractForm from "@/components/contracts/ContractForm";
import { toast } from "@/hooks/use-toast";

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
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const navigate = useNavigate();

  const filteredContracts = contracts.filter(
    (contract) =>
      contract.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contract.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (contract: Contract) => {
    setSelectedContract(contract);
    setShowEditForm(true);
  };

  const handleDownload = (contractId: string) => {
    toast({
      title: "Download started",
      description: `Downloading contract ${contractId}`,
    });
  };

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
                  <TableCell className="font-medium cursor-pointer hover:text-ammp-blue" onClick={() => navigate(`/contracts/${contract.id}`)}>
                    {contract.id}
                  </TableCell>
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
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleDownload(contract.id)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(contract)}>
                            Edit Contract
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/contracts/${contract.id}`)}>
                            View Details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Contract - {selectedContract?.customer}</DialogTitle>
            </DialogHeader>
            <ContractForm />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default ContractList;
