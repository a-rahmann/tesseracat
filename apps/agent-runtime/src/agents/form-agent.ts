import { ElementTarget } from '../../../../packages/core-types/dist/index.js';
import { FormFieldInfo, FormFillFieldInput, FormInspectResult } from '../../../../packages/mcp-schemas/dist/index.js';

export interface UserProfileData {
  fullName: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export class FormAgent {
  private defaultProfile: UserProfileData = {
    fullName: 'Abdul Rahman',
    email: 'abdul@example.com',
    phone: '+91 9876543210',
    address: '123 Tech Residency, Cyber City',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'India',
  };

  /**
   * Classify whether a field is sensitive (password, card, cvv, otp) vs normal personal profile info.
   */
  public isFieldSensitive(field: { type?: string; name?: string; label?: string; id?: string }): boolean {
    const combined = `${field.type || ''} ${field.name || ''} ${field.label || ''} ${field.id || ''}`.toLowerCase();
    const sensitiveKeywords = ['password', 'pwd', 'secret', 'cvv', 'cvc', 'cardnumber', 'card-number', 'creditcard', 'otp', 'pin', 'ssn'];
    return sensitiveKeywords.some(kw => combined.includes(kw));
  }

  /**
   * Map form fields to available user profile information.
   */
  public mapFieldsToProfile(
    fields: FormFieldInfo[],
    customProfile?: Partial<UserProfileData>
  ): {
    safeFieldsToFill: FormFillFieldInput[];
    sensitiveFieldsRequiringApproval: FormFieldInfo[];
  } {
    const profile = { ...this.defaultProfile, ...customProfile };
    const safeFieldsToFill: FormFillFieldInput[] = [];
    const sensitiveFieldsRequiringApproval: FormFieldInfo[] = [];

    for (const field of fields) {
      if (this.isFieldSensitive(field)) {
        sensitiveFieldsRequiringApproval.push(field);
        continue;
      }

      const desc = `${field.name || ''} ${field.label || ''} ${field.placeholder || ''} ${field.id || ''} ${field.autocomplete || ''}`.toLowerCase();
      let matchedValue: string | undefined;

      if (desc.includes('name') && !desc.includes('user') && !desc.includes('company')) {
        matchedValue = profile.fullName;
      } else if (desc.includes('email') || field.type === 'email') {
        matchedValue = profile.email;
      } else if (desc.includes('phone') || desc.includes('tel') || field.type === 'tel') {
        matchedValue = profile.phone;
      } else if (desc.includes('address') || desc.includes('street')) {
        matchedValue = profile.address;
      } else if (desc.includes('city')) {
        matchedValue = profile.city;
      } else if (desc.includes('state') || desc.includes('province')) {
        matchedValue = profile.state;
      } else if (desc.includes('zip') || desc.includes('postal') || desc.includes('pincode')) {
        matchedValue = profile.postalCode;
      } else if (desc.includes('country')) {
        matchedValue = profile.country;
      }

      if (matchedValue) {
        safeFieldsToFill.push({
          target: {
            selector: field.selector,
            name: field.name,
            role: 'textbox',
          },
          value: matchedValue,
          isSensitive: false,
        });
      }
    }

    return {
      safeFieldsToFill,
      sensitiveFieldsRequiringApproval,
    };
  }
}
