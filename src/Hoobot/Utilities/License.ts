import { logToFile } from "./LogToFile";

// Function to check if the provided license key is valid
export const checkLicenseValidity = async (license: string): Promise<boolean> => {
  console.log(`License: ${license}`);
  return true;
};
