import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Folder, ChevronRight, Building2, HardDrive, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SharePointFolderBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (
    siteId: string,
    siteName: string,
    driveId: string,
    driveName: string,
    folderId: string | null,
    folderPath: string
  ) => void;
}

interface Site {
  id: string;
  name: string;
  webUrl: string;
}

interface Drive {
  id: string;
  name: string;
  driveType: string;
  webUrl: string;
}

interface FolderItem {
  id: string;
  name: string;
  path: string;
  webUrl: string;
}

type Step = 'sites' | 'drives' | 'folders';

const SharePointFolderBrowser = ({ open, onOpenChange, onSelect }: SharePointFolderBrowserProps) => {
  const [step, setStep] = useState<Step>('sites');
  const [loading, setLoading] = useState(false);
  
  const [sites, setSites] = useState<Site[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [selectedDrive, setSelectedDrive] = useState<Drive | null>(null);
  const [folderStack, setFolderStack] = useState<FolderItem[]>([]);

  useEffect(() => {
    if (open) {
      loadSites();
    } else {
      // Reset state when dialog closes
      setStep('sites');
      setSites([]);
      setDrives([]);
      setFolders([]);
      setSelectedSite(null);
      setSelectedDrive(null);
      setFolderStack([]);
    }
  }, [open]);

  const loadSites = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sharepoint-list-sites');
      
      if (error) throw error;
      
      setSites(data.sites || []);
    } catch (error) {
      console.error('Error loading sites:', error);
      toast.error('Failed to load SharePoint sites');
    } finally {
      setLoading(false);
    }
  };

  const loadDrives = async (siteId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sharepoint-list-drives', {
        body: { siteId },
      });
      
      if (error) throw error;
      
      setDrives(data.drives || []);
      setStep('drives');
    } catch (error) {
      console.error('Error loading drives:', error);
      toast.error('Failed to load document libraries');
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async (driveId: string, folderId?: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sharepoint-list-folders', {
        body: { driveId, folderId },
      });
      
      if (error) throw error;
      
      setFolders(data.folders || []);
      setStep('folders');
    } catch (error) {
      console.error('Error loading folders:', error);
      toast.error('Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const handleSiteSelect = (site: Site) => {
    setSelectedSite(site);
    loadDrives(site.id);
  };

  const handleDriveSelect = (drive: Drive) => {
    setSelectedDrive(drive);
    setFolderStack([]);
    loadFolders(drive.id);
  };

  const handleFolderClick = (folder: FolderItem) => {
    if (!selectedDrive) return;
    setFolderStack([...folderStack, folder]);
    loadFolders(selectedDrive.id, folder.id);
  };

  const handleBack = () => {
    if (step === 'folders' && folderStack.length > 0) {
      const newStack = [...folderStack];
      newStack.pop();
      setFolderStack(newStack);
      if (newStack.length === 0) {
        loadFolders(selectedDrive!.id);
      } else {
        loadFolders(selectedDrive!.id, newStack[newStack.length - 1].id);
      }
    } else if (step === 'folders') {
      setStep('drives');
      setFolders([]);
    } else if (step === 'drives') {
      setStep('sites');
      setDrives([]);
      setSelectedSite(null);
    }
  };

  const handleSelectCurrentFolder = () => {
    if (!selectedSite || !selectedDrive) return;
    
    const currentFolder = folderStack.length > 0 ? folderStack[folderStack.length - 1] : null;
    const folderPath = currentFolder?.path || '/';
    
    onSelect(
      selectedSite.id,
      selectedSite.name,
      selectedDrive.id,
      selectedDrive.name,
      currentFolder?.id || null,
      folderPath
    );
  };

  const getBreadcrumb = () => {
    const parts: string[] = [];
    if (selectedSite) parts.push(selectedSite.name);
    if (selectedDrive) parts.push(selectedDrive.name);
    folderStack.forEach(f => parts.push(f.name));
    return parts.join(' / ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select SharePoint Folder</DialogTitle>
          <DialogDescription>
            {step === 'sites' && 'Select a SharePoint site'}
            {step === 'drives' && 'Select a document library'}
            {step === 'folders' && 'Browse and select a folder'}
          </DialogDescription>
        </DialogHeader>

        {step !== 'sites' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground border-b pb-2">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <span className="truncate">{getBreadcrumb()}</span>
          </div>
        )}

        <ScrollArea className="h-[300px] border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {step === 'sites' && sites.map(site => (
                <button
                  key={site.id}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted text-left"
                  onClick={() => handleSiteSelect(site)}
                >
                  <Building2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <span className="flex-1 truncate">{site.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}

              {step === 'drives' && drives.map(drive => (
                <button
                  key={drive.id}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted text-left"
                  onClick={() => handleDriveSelect(drive)}
                >
                  <HardDrive className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <span className="flex-1 truncate">{drive.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}

              {step === 'folders' && folders.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No subfolders in this location
                </p>
              )}

              {step === 'folders' && folders.map(folder => (
                <button
                  key={folder.id}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted text-left"
                  onClick={() => handleFolderClick(folder)}
                >
                  <Folder className="h-5 w-5 text-blue-500 flex-shrink-0" />
                  <span className="flex-1 truncate">{folder.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}

              {step === 'sites' && sites.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No SharePoint sites found
                </p>
              )}

              {step === 'drives' && drives.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No document libraries found
                </p>
              )}
            </div>
          )}
        </ScrollArea>

        {step === 'folders' && (
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSelectCurrentFolder}>
              Select This Folder
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SharePointFolderBrowser;
