import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VerifierManagerComponent } from './verifier-manager.component';

describe('VerifierManagerComponent', () => {
  let component: VerifierManagerComponent;
  let fixture: ComponentFixture<VerifierManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerifierManagerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VerifierManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
