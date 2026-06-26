import { Component } from '@angular/core';
import {Button} from "primeng/button";
import {
  CreateProjectDialogComponent
} from "../../project-explorer/create-project-dialog/create-project-dialog.component";
import {TreeService} from "../../../services/tree/tree.service";
import {NetworkJobService} from "../../../services/tree/network/network-job.service";
import {DialogService} from "primeng/dynamicdialog";
import {ProjectService} from "../../../services/project/project.service";
import {GlobalSettingsService} from "../../../services/global-settings.service";
import {ConfirmationService, MessageService} from "primeng/api";

/**
 * The global Verify button.
 * Uses {@link NetworkJobService} to verify the root formula of the current file.
 */
@Component({
  selector: 'app-verify-button-global',
    imports: [
        Button
    ],
  templateUrl: './verify-button-global.component.html',
  styleUrl: './verify-button-global.component.css',
})
export class VerifyButtonGlobalComponent {
  constructor(
      private treeService: TreeService,
      private networkTreeService: NetworkJobService,
      private dialogService: DialogService,
      private projectService: ProjectService,
      private globalSettingsService: GlobalSettingsService,
      private confirmationService: ConfirmationService,
      private messageService: MessageService,
  ) {}
  /**
   * Triggered on pressing the verify Button.
   * Sideeffect: When there are unsaved changes and no backend project connected prompt user to save before verifying.
   * This is needed for the backend to verify the contents of the project.
   */
  public verify(): void {
    this.treeService.finalizeStatements();
    if (this.projectService.shouldCreateProject) {
      this.confirmationService.confirm({
        message:
            "You have unsaved changes. Do you want to save them before verifying?",
        header: "Unsaved Changes",
        icon: "pi pi-exclamation-triangle",
        accept: () => {
          this.openNewProjectDialog()?.onClose.subscribe((created) => {
            if (created) {
              this.projectService.uploadWorkspace().then(() => {
                this.messageService.add({
                  summary: "Save successful",
                  severity: "success",
                });
                this.verify();
              });
            } else {
              this.messageService.add({
                summary: "Save cancelled",
                detail: "No project specified to save to",
                severity: "warn",
              });
            }
          });
        },
        reject: () => {
          this.globalSettingsService.isVerifying = true;
          this.networkTreeService.verify(
              this.treeService.rootFormula,
              this.projectService.projectId,
              this.treeService.urn,
          );
        },
      });
    } else {
      this.globalSettingsService.isVerifying = true;
      this.networkTreeService.verify(
          this.treeService.rootFormula,
          this.projectService.projectId,
          this.treeService.urn,
      );
    }
  }

  /**
   * Opens the dialog to create a new backend project.
   */
  private openNewProjectDialog() {
    return this.dialogService.open(CreateProjectDialogComponent, {
      header: "Select Project",
      modal: true,
    });
  }

  /**
   * Whether the verify Button is disabled because no root formula exists to verify.
   */
  protected get isDisabled(): boolean {
    return !this.treeService.rootFormula;
  }

  /**
   * Whether a verification is currently in progress, used for the Button loading state.
   */
  protected get isVerifying(): boolean {
    return this.globalSettingsService.isVerifying;
  }
}
