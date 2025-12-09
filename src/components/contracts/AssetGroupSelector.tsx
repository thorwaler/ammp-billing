import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Loader2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataApiClient } from "@/services/ammp/dataApiClient";
import { AssetGroupResponse } from "@/types/ammp-api";

interface AssetGroupSelectorProps {
  orgId?: string;
  value?: string;
  onSelect: (groupId: string, groupName: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  label?: string;
  optional?: boolean;
  showClearButton?: boolean;
}

export function AssetGroupSelector({ 
  orgId, 
  value, 
  onSelect,
  onClear,
  disabled,
  label = "AMMP Asset Group",
  optional = false,
  showClearButton = false
}: AssetGroupSelectorProps) {
  const [groups, setGroups] = useState<AssetGroupResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [customId, setCustomId] = useState("");
  const [customName, setCustomName] = useState("");

  // Find the selected group name for display
  const selectedGroup = groups.find(g => g.group_id === value);
  const displayName = selectedGroup?.group_name || value || "";

  useEffect(() => {
    const fetchGroups = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const assetGroups = await dataApiClient.listAssetGroups();
        // Sort alphabetically by name
        const sortedGroups = assetGroups.sort((a, b) => 
          a.group_name.localeCompare(b.group_name)
        );
        setGroups(sortedGroups);
      } catch (err) {
        console.error("Error fetching asset groups:", err);
        setError("Failed to load asset groups");
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, []);

  const handleSelectGroup = (groupId: string, groupName: string) => {
    onSelect(groupId, groupName);
    setOpen(false);
  };

  const handleUseCustom = () => {
    if (customId.trim()) {
      onSelect(customId.trim(), customName.trim() || customId.trim());
      setOpen(false);
      setCustomId("");
      setCustomName("");
    }
  };

  const labelText = optional ? `${label} (optional)` : label;

  if (loading) {
    return (
      <div>
        <Label>{labelText}</Label>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading asset groups...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Label>{labelText}</Label>
        <div className="text-sm text-destructive mt-1">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <Label>{labelText}</Label>
      <div className="flex gap-2 mt-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="flex-1 justify-between"
              disabled={disabled}
            >
              {displayName || "Select asset group..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 bg-popover" align="start">
          <Command>
            <CommandInput placeholder="Search asset groups..." />
            <CommandList>
              <CommandEmpty>No groups found. Use manual entry below.</CommandEmpty>
              <CommandGroup heading={`Asset Groups (${groups.length})`}>
                {groups.map((group) => (
                  <CommandItem
                    key={group.group_id}
                    value={group.group_name}
                    onSelect={() => handleSelectGroup(group.group_id, group.group_name)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === group.group_id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{group.group_name}</span>
                      {group.description && (
                        <span className="text-xs text-muted-foreground">
                          {group.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t p-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Or enter manually:</Label>
              <div className="flex flex-col gap-2">
                <Input 
                  value={customId} 
                  onChange={(e) => setCustomId(e.target.value)}
                  placeholder="Asset group ID" 
                  className="h-8 text-sm"
                />
                <Input 
                  value={customName} 
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Display name (optional)" 
                  className="h-8 text-sm"
                />
                <Button 
                  size="sm" 
                  onClick={handleUseCustom}
                  disabled={!customId.trim()}
                >
                  Use Custom Value
                </Button>
              </div>
            </div>
          </Command>
        </PopoverContent>
        </Popover>
        {showClearButton && value && onClear && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="shrink-0"
          >
            Clear
          </Button>
        )}
      </div>
      {value && (
        <p className="text-xs text-muted-foreground mt-1">
          ID: {value}
        </p>
      )}
    </div>
  );
}
