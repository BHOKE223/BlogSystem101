import { GitHubService } from "./github-service";
import { storage } from "./storage";
import { sourceBackupService } from "./source-backup-service";
import type { Blog } from "@shared/schema";

class BackgroundServices {
  private static instance: BackgroundServices;
  private initialized = false;

  static getInstance(): BackgroundServices {
    if (!BackgroundServices.instance) {
      BackgroundServices.instance = new BackgroundServices();
    }
    return BackgroundServices.instance;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("🔧 Background services initialized");
    
    // Perform initial source code backup
    setTimeout(() => {
      sourceBackupService.backupSourceCode();
    }, 5000);
  }

  // Source code backup when significant changes are made
  scheduleSourceBackup(delayMs = 10000): void {
    setTimeout(() => {
      sourceBackupService.backupSourceCode().catch(error => {
        console.log(`Source backup failed:`, error);
      });
    }, delayMs);
  }
}

export const backgroundServices = BackgroundServices.getInstance();