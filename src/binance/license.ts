const fetch = require('node-fetch');

// Function to check if the provided license key is valid
export const checkLicenseValidity = async (licenseKey) => {
  const url = 'https://hoosat.fi/api/license-check'; // Replace with the actual URL for license validation

  try {
    const response = await fetch(url, {
      method: 'POST', // You may use POST or GET based on the server's requirements
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ licenseKey }),
    });

    if (!response.ok) {
      throw new Error('License check failed. Please try again later.');
    }

    const data = await response.json();
    return data.isValid; // Assuming the server returns { isValid: true } or { isValid: false }
  } catch (error) {
    console.error('License check failed:', error.message);
    return false; // Return false if there was an error during the license check
  }
}

// Example usage
// const licenseKeyToCheck = 'license1234';
// checkLicenseValidity(licenseKeyToCheck)
//   .then(isValid => {
//     if (isValid) {
//       console.log('License key is valid. Enjoy the full version!');
//     } else {
//       console.log('Invalid license key. Please purchase a valid license.');
//     }
//   })
//   .catch(err => {
//     console.error('License check failed:', err.message);
//   });
