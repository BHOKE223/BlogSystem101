import { GitHubService } from "./github-service";
import { storage } from "./storage";
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

class SourceBackupService {
  private static instance: SourceBackupService;
  
  static getInstance(): SourceBackupService {
    if (!SourceBackupService.instance) {
      SourceBackupService.instance = new SourceBackupService();
    }
    return SourceBackupService.instance;
  }

  private calculateFileHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private backupRecordsFile = 'backup_records.json';

  private loadBackupRecords(): Record<string, any> {
    try {
      if (fs.existsSync(this.backupRecordsFile)) {
        const data = fs.readFileSync(this.backupRecordsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.log('Failed to load backup records:', error);
    }
    return {};
  }

  private saveBackupRecords(records: Record<string, any>) {
    try {
      fs.writeFileSync(this.backupRecordsFile, JSON.stringify(records, null, 2));
    } catch (error) {
      console.log('Failed to save backup records:', error);
    }
  }

  private async getFileBackupRecord(filePath: string) {
    const records = this.loadBackupRecords();
    return records[filePath] || null;
  }

  private async updateFileBackupRecord(filePath: string, fileHash: string, commitSha: string, fileSize: number) {
    const records = this.loadBackupRecords();
    records[filePath] = {
      fileHash,
      githubCommitSha: commitSha,
      fileSize,
      lastBackupAt: new Date().toISOString()
    };
    this.saveBackupRecords(records);
  }

  async backupSourceCode(): Promise<void> {
    try {
      const credentials = await storage.getGitHubCredentials();
      if (!credentials) {
        console.log("No GitHub credentials configured for source backup");
        return;
      }

      const githubService = new GitHubService(credentials);
      
      // Files and directories to backup
      const filesToBackup = [
        // Frontend source
        'client/src/App.tsx',
        'client/src/main.tsx',
        'client/src/components/ContentPreviewPanel.tsx',
        'client/src/components/KeywordInputPanel.tsx',
        'client/src/components/ImageSelectionPanel.tsx',
        'client/src/components/MarkdownRenderer.tsx',
        'client/src/lib/api.ts',
        'client/src/lib/queryClient.ts',
        
        // Backend source
        'server/index.ts',
        'server/routes.ts',
        'server/storage.ts',
        'server/github-service.ts',
        'server/background-services.ts',
        'server/source-backup-service.ts',
        'server/db.ts',
        'server/vite.ts',
        
        // Configuration files
        'package.json',
        'package-lock.json',
        'vite.config.ts',
        'tailwind.config.ts',
        'drizzle.config.ts',
        'tsconfig.json',
        
        // Schema and shared code
        'shared/schema.ts',
        
        // Documentation
        'README.md'
      ];

      console.log("Starting incremental source code backup to GitHub...");
      let changedFiles = 0;
      let skippedFiles = 0;
      
      for (const filePath of filesToBackup) {
        try {
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const currentHash = this.calculateFileHash(content);
            const fileSize = content.length;
            
            // Check if file has changed since last backup
            const backupRecord = await this.getFileBackupRecord(filePath);
            
            if (backupRecord && backupRecord.fileHash === currentHash) {
              skippedFiles++;
              continue; // Skip unchanged files
            }
            
            const fileName = path.basename(filePath);
            const githubPath = filePath; // Keep original structure
            
            // Create or update file without SHA for initial uploads
            const result = await githubService.createOrUpdateFile(
              githubPath,
              content,
              `Update ${fileName} - incremental backup`
            );
            
            // Update backup record in database
            await this.updateFileBackupRecord(filePath, currentHash, result.sha, fileSize);
            
            console.log(`✅ Backed up changed file: ${filePath}`);
            changedFiles++;
          }
        } catch (error) {
          console.log(`❌ Failed to backup ${filePath}:`, error instanceof Error ? error.message : error);
        }
      }
      
      // Only update project info if files changed
      if (changedFiles > 0) {
        const projectInfo = {
          name: "AI-Powered SEO Blog Generation Platform",
          description: "Advanced blog generation system with WordPress integration and incremental GitHub backup",
          version: "1.0.0",
          lastBackup: new Date().toISOString(),
          filesChanged: changedFiles,
          filesSkipped: skippedFiles,
          features: [
            "AI-powered content generation using OpenAI",
            "WordPress API integration for publishing",
            "Unsplash image integration",
            "SEO optimization and category matching",
            "Smart incremental GitHub source code backup",
            "Real-time content preview and editing",
            "Image replacement and optimization"
          ],
          technology: {
            frontend: "React + TypeScript + Tailwind CSS + Vite",
            backend: "Node.js + Express + TypeScript",
            database: "PostgreSQL with Drizzle ORM",
            apis: "OpenAI, WordPress REST API, Unsplash"
          }
        };
        
        await githubService.createOrUpdateFile(
          'PROJECT_INFO.json',
          JSON.stringify(projectInfo, null, 2),
          'Update project information - incremental backup'
        );
      }
      
      console.log(`🎯 Incremental backup completed: ${changedFiles} files updated, ${skippedFiles} files unchanged`);
      
    } catch (error) {
      console.log("Source code backup failed:", error instanceof Error ? error.message : error);
    }
  }
}

export const sourceBackupService = SourceBackupService.getInstance();