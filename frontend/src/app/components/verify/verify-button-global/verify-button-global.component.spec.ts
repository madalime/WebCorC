import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { DialogService } from 'primeng/dynamicdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { VerifyButtonGlobalComponent } from './verify-button-global.component';

describe('VerifyButtonGlobalComponent', () => {
  let component: VerifyButtonGlobalComponent;
  let fixture: ComponentFixture<VerifyButtonGlobalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerifyButtonGlobalComponent],
      providers: [
        provideHttpClient(),
        provideAnimations(),
        DialogService,
        ConfirmationService,
        MessageService,
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(VerifyButtonGlobalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
