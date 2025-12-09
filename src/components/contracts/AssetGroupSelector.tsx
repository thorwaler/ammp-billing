import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { dataApiClient } from "@/services/ammp/dataApiClient";
import { AssetGroupResponse } from "@/types/ammp-api";

interface AssetGroupSelectorProps {
  orgId?: string;
  value?: string;
  onSelect: (groupId: string, groupName: string) => void;
  disabled?: boolean;
}

export function AssetGroupSelector({ 
  orgId, 
  value, 
  onSelect, 
  disabled 
}: AssetGroupSelectorProps) {
  const [groups, setGroups] = useState<AssetGroupResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGroups = async () => {
      if (!orgId) {
        setGroups([]);
        return;
      }

      setLoading(true);
      setError(null);
      
      try {
        const assetGroups = await dataApiClient.listAssetGroups();
        // Filter to groups belonging to this org
        const filteredGroups = assetGroups.filter(g => g.org_id === orgId);
        setGroups(filteredGroups);
      } catch (err) {
        console.error("Error fetching asset groups:", err);
        setError("Failed to load asset groups");
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [orgId]);

  if (!orgId) {
    return (
      <div className="text-sm text-muted-foreground">
        Customer must have AMMP organization linked to select asset groups
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading asset groups...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">{error}</div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No asset groups found for this organization
      </div>
    );
  }

  return (
    <div>
      <Label>AMMP Asset Group</Label>
      <Select
        value={value}
        onValueChange={(val) => {
          const group = groups.find(g => g.group_id === val);
          if (group) {
            onSelect(group.group_id, group.group_name);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger className="mt-1">
          <SelectValue placeholder="Select asset group" />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectItem key={group.group_id} value={group.group_id}>
              {group.group_name}
              {group.description && (
                <span className="text-muted-foreground ml-2">
                  ({group.description})
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
