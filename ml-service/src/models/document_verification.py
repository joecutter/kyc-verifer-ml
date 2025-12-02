import cv2
import numpy as np
import easyocr
import pytesseract
from typing import Dict, List, Any, Optional, Tuple
import re
from datetime import datetime
import warnings

warnings.filterwarnings("ignore")

class DocumentVerificationModel:
    """Document verification and OCR extraction"""
    
    def __init__(self):
        self.reader = None
        self._initialize_ocr()
        
        # Document patterns and regexes
        self.document_patterns = {
            'passport': {
                'regexes': [
                    r'P[A-Z]<[A-Z]{3}[A-Z]+<<[A-Z]+<*',
                    r'[A-Z]{1,2}\d{6,8}',
                ],
                'fields': ['document_number', 'surname', 'given_names', 'nationality', 'dob', 'expiry', 'sex'],
            },
            'driver_license': {
                'regexes': [
                    r'D[A-Z]{3}[A-Z0-9]{6,9}',
                    r'DL \d{6,12}',
                ],
                'fields': ['license_number', 'name', 'address', 'dob', 'expiry', 'class'],
            },
            'id_card': {
                'regexes': [
                    r'ID[A-Z]{2}\d{6,9}',
                    r'\d{9,12}',
                ],
                'fields': ['id_number', 'name', 'dob', 'expiry', 'address'],
            },
        }
        
    def _initialize_ocr(self):
        """Initialize OCR reader"""
        try:
            # Initialize EasyOCR
            self.reader = easyocr.Reader(
                ['en'],  # English by default
                gpu=False,  # Set to True if GPU available
                model_storage_directory='./models',
                download_enabled=True
            )
            print("OCR reader initialized successfully")
            
        except Exception as e:
            print(f"Error initializing OCR: {e}")
            # Fallback to pytesseract
            self.reader = None
    
    def verify_document(
        self, 
        front_image: np.ndarray,
        back_image: Optional[np.ndarray] = None,
        document_type: str = None
    ) -> Dict[str, Any]:
        """
        Verify document and extract information
        
        Args:
            front_image: Front side of document
            back_image: Back side of document (optional)
            document_type: Expected document type
        
        Returns:
            Document verification results
        """
        try:
            results = {
                'is_valid': False,
                'document_type': document_type or 'unknown',
                'extracted_data': {},
                'quality_score': 0.0,
                'fraud_indicators': [],
                'metadata': {},
            }
            
            # Preprocess document images
            front_processed = self._preprocess_document(front_image)
            back_processed = self._preprocess_document(back_image) if back_image is not None else None
            
            # Calculate document quality score
            quality_score = self._calculate_document_quality(front_processed, back_processed)
            results['quality_score'] = quality_score
            
            # Detect document type if not provided
            if not document_type:
                document_type = self._detect_document_type(front_processed)
                results['document_type'] = document_type
            
            # Extract text from both sides
            front_text = self._extract_text(front_processed)
            back_text = self._extract_text(back_processed) if back_processed is not None else ""
            
            # Parse extracted data
            extracted_data = self._parse_document_data(
                front_text, 
                back_text, 
                document_type
            )
            results['extracted_data'] = extracted_data
            
            # Check for fraud indicators
            fraud_indicators = self._detect_fraud_indicators(
                front_processed,
                back_processed,
                extracted_data,
                document_type
            )
            results['fraud_indicators'] = fraud_indicators
            
            # Validate document
            is_valid = self._validate_document(
                extracted_data,
                fraud_indicators,
                quality_score,
                document_type
            )
            results['is_valid'] = is_valid
            
            # Additional metadata
            results['metadata'] = {
                'text_confidence': self._calculate_text_confidence(front_text, back_text),
                'image_metrics': self._calculate_image_metrics(front_processed, back_processed),
                'processing_time': None,  # Would be actual processing time
            }
            
            return results
            
        except Exception as e:
            print(f"Error in document verification: {e}")
            return {
                'is_valid': False,
                'error': str(e),
                'fraud_indicators': ['verification_failed'],
            }
    
    def _preprocess_document(self, image: np.ndarray) -> np.ndarray:
        """Preprocess document image for better OCR results"""
        if image is None:
            return None
        
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image.copy()
            
            # Resize if too large
            height, width = gray.shape
            if max(height, width) > 2000:
                scale = 2000 / max(height, width)
                new_size = (int(width * scale), int(height * scale))
                gray = cv2.resize(gray, new_size, interpolation=cv2.INTER_AREA)
            
            # Enhance contrast
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            
            # Remove noise
            denoised = cv2.medianBlur(enhanced, 3)
            
            # Adaptive thresholding
            binary = cv2.adaptiveThreshold(
                denoised, 255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 11, 2
            )
            
            # Deskew (straighten document)
            deskewed = self._deskew_image(binary)
            
            return deskewed
            
        except Exception as e:
            print(f"Error preprocessing document: {e}")
            return image
    
    def _deskew_image(self, image: np.ndarray) -> np.ndarray:
        """Deskew (straighten) document image"""
        try:
            # Find edges
            edges = cv2.Canny(image, 50, 200, apertureSize=3)
            
            # Find lines using Hough transform
            lines = cv2.HoughLines(edges, 1, np.pi/180, 200)
            
            if lines is None:
                return image
            
            # Calculate average angle
            angles = []
            for line in lines[:20]:
                rho, theta = line[0]
                angle = theta * 180 / np.pi - 90
                if -45 <= angle <= 45:
                    angles.append(angle)
            
            if not angles:
                return image
            
            avg_angle = np.mean(angles)
            
            # Rotate image to correct skew
            height, width = image.shape
            center = (width // 2, height // 2)
            rotation_matrix = cv2.getRotationMatrix2D(center, avg_angle, 1.0)
            deskewed = cv2.warpAffine(
                image, rotation_matrix, (width, height),
                flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
            )
            
            return deskewed
            
        except:
            return image
    
    def _calculate_document_quality(
        self, 
        front_image: Optional[np.ndarray], 
        back_image: Optional[np.ndarray]
    ) -> float:
        """Calculate document image quality score"""
        try:
            scores = []
            
            for img in [front_image, back_image]:
                if img is None:
                    continue
                
                # Focus/blur detection
                blur_score = self._calculate_blur_score(img)
                
                # Brightness score
                brightness = np.mean(img) / 255.0
                brightness_score = 1.0 - abs(brightness - 0.5) / 0.5
                
                # Contrast score
                contrast = np.std(img) / 255.0
                contrast_score = min(contrast * 2, 1.0)
                
                # Sharpness score
                sharpness = cv2.Laplacian(img, cv2.CV_64F).var() / 1000.0
                sharpness_score = min(sharpness, 1.0)
                
                # Combined quality score
                img_score = (
                    0.4 * blur_score +
                    0.2 * brightness_score +
                    0.2 * contrast_score +
                    0.2 * sharpness_score
                )
                scores.append(img_score)
            
            if scores:
                return float(np.mean(scores))
            else:
                return 0.0
                
        except:
            return 0.5
    
    def _calculate_blur_score(self, image: np.ndarray) -> float:
        """Calculate blur score (higher = less blurry)"""
        try:
            # Calculate variance of Laplacian
            laplacian_var = cv2.Laplacian(image, cv2.CV_64F).var()
            
            # Normalize score
            if laplacian_var > 100:
                return 1.0
            elif laplacian_var > 50:
                return 0.8
            elif laplacian_var > 20:
                return 0.5
            elif laplacian_var > 10:
                return 0.3
            else:
                return 0.1
                
        except:
            return 0.5
    
    def _detect_document_type(self, image: np.ndarray) -> str:
        """Detect document type from image"""
        try:
            # Extract text
            text = self._extract_text(image)
            
            # Check for document patterns
            for doc_type, patterns in self.document_patterns.items():
                for regex in patterns['regexes']:
                    if re.search(regex, text, re.IGNORECASE):
                        return doc_type
            
            # Check for common keywords
            if re.search(r'PASSPORT|PASSEPORT', text, re.IGNORECASE):
                return 'passport'
            elif re.search(r'DRIVER|LICENSE|PERMIS', text, re.IGNORECASE):
                return 'driver_license'
            elif re.search(r'IDENTITY|IDENTITE|CARTE', text, re.IGNORECASE):
                return 'id_card'
            
            return 'unknown'
            
        except:
            return 'unknown'
    
    def _extract_text(self, image: Optional[np.ndarray]) -> str:
        """Extract text from image using OCR"""
        if image is None:
            return ""
        
        try:
            # Use EasyOCR if available
            if self.reader is not None:
                results = self.reader.readtext(
                    image,
                    paragraph=True,
                    detail=0,
                    batch_size=10
                )
                text = " ".join(results)
            else:
                # Fallback to pytesseract
                text = pytesseract.image_to_string(
                    image,
                    config='--psm 6 --oem 3'
                )
            
            # Clean up text
            text = re.sub(r'\s+', ' ', text).strip()
            
            return text
            
        except Exception as e:
            print(f"Error extracting text: {e}")
            return ""
    
    def _parse_document_data(
        self, 
        front_text: str, 
        back_text: str, 
        document_type: str
    ) -> Dict[str, Any]:
        """Parse extracted text into structured data"""
        try:
            data = {}
            combined_text = f"{front_text} {back_text}".upper()
            
            # Extract name (simplified)
            name_patterns = [
                r'NAME[:\s]+([A-Z\s,.-]+?)(?=\n|$)',
                r'SURNAME[:\s]+([A-Z\s,.-]+?)(?=\n|$)',
                r'LAST NAME[:\s]+([A-Z\s,.-]+?)(?=\n|$)',
                r'FAMILY NAME[:\s]+([A-Z\s,.-]+?)(?=\n|$)',
            ]
            
            for pattern in name_patterns:
                match = re.search(pattern, combined_text, re.IGNORECASE)
                if match:
                    data['name'] = match.group(1).strip()
                    break
            
            # Extract date of birth
            dob_patterns = [
                r'DOB[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
                r'DATE OF BIRTH[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
                r'BIRTH[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
                r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b',
            ]
            
            for pattern in dob_patterns:
                match = re.search(pattern, combined_text, re.IGNORECASE)
                if match:
                    data['date_of_birth'] = match.group(1).strip()
                    break
            
            # Extract expiry date
            expiry_patterns = [
                r'EXPIRY[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
                r'EXPIRATION[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
                r'VALID UNTIL[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            ]
            
            for pattern in expiry_patterns:
                match = re.search(pattern, combined_text, re.IGNORECASE)
                if match:
                    data['expiry_date'] = match.group(1).strip()
                    break
            
            # Extract document number
            if document_type in self.document_patterns:
                for regex in self.document_patterns[document_type]['regexes']:
                    match = re.search(regex, combined_text)
                    if match:
                        data['document_number'] = match.group().strip()
                        break
            
            # Extract nationality
            nationality_match = re.search(
                r'NATIONALITY[:\s]+([A-Z\s]+?)(?=\n|$)',
                combined_text,
                re.IGNORECASE
            )
            if nationality_match:
                data['nationality'] = nationality_match.group(1).strip()
            
            # Extract address (simplified)
            address_match = re.search(
                r'ADDRESS[:\s]+(.+?)(?=\n\n|\n[A-Z]{2,}:|$)',
                combined_text,
                re.DOTALL | re.IGNORECASE
            )
            if address_match:
                data['address'] = address_match.group(1).strip().replace('\n', ', ')
            
            return data
            
        except Exception as e:
            print(f"Error parsing document data: {e}")
            return {}
    
    def _detect_fraud_indicators(
        self,
        front_image: Optional[np.ndarray],
        back_image: Optional[np.ndarray],
        extracted_data: Dict[str, Any],
        document_type: str
    ) -> List[str]:
        """Detect potential fraud indicators in document"""
        fraud_indicators = []
        
        try:
            # Check for poor image quality
            if front_image is not None:
                blur_score = self._calculate_blur_score(front_image)
                if blur_score < 0.3:
                    fraud_indicators.append('blurry_image')
            
            # Check for missing required fields
            required_fields = self.document_patterns.get(document_type, {}).get('fields', [])
            for field in ['name', 'document_number']:
                if field in required_fields and field not in extracted_data:
                    fraud_indicators.append(f'missing_{field}')
            
            # Check document validity dates
            if 'expiry_date' in extracted_data:
                try:
                    expiry = self._parse_date(extracted_data['expiry_date'])
                    if expiry < datetime.now():
                        fraud_indicators.append('expired_document')
                except:
                    fraud_indicators.append('invalid_date_format')
            
            # Check for obvious tampering (simplified)
            if front_image is not None:
                tampering_score = self._detect_tampering(front_image)
                if tampering_score > 0.7:
                    fraud_indicators.append('possible_tampering')
            
            # Check for consistency between front and back
            if front_image is not None and back_image is not None:
                consistency_score = self._check_consistency(front_image, back_image)
                if consistency_score < 0.5:
                    fraud_indicators.append('inconsistent_document_sides')
            
            return fraud_indicators
            
        except:
            return ['fraud_detection_failed']
    
    def _detect_tampering(self, image: np.ndarray) -> float:
        """Detect potential document tampering"""
        try:
            # Check for inconsistent lighting/shadow
            gray = image if len(image.shape) == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Divide image into grid
            height, width = gray.shape
            grid_size = 4
            cell_h, cell_w = height // grid_size, width // grid_size
            
            brightness_std = []
            for i in range(grid_size):
                for j in range(grid_size):
                    cell = gray[i*cell_h:(i+1)*cell_h, j*cell_w:(j+1)*cell_w]
                    brightness_std.append(np.std(cell))
            
            # High variance in brightness std across cells = potential tampering
            tampering_score = np.std(brightness_std) / 100.0
            
            return min(tampering_score, 1.0)
            
        except:
            return 0.0
    
    def _check_consistency(
        self, 
        front_image: np.ndarray, 
        back_image: np.ndarray
    ) -> float:
        """Check consistency between front and back of document"""
        try:
            # Compare color histograms
            front_hist = cv2.calcHist([front_image], [0], None, [256], [0, 256])
            back_hist = cv2.calcHist([back_image], [0], None, [256], [0, 256])
            
            # Normalize histograms
            front_hist = cv2.normalize(front_hist, front_hist).flatten()
            back_hist = cv2.normalize(back_hist, back_hist).flatten()
            
            # Calculate correlation
            correlation = cv2.compareHist(front_hist, back_hist, cv2.HISTCMP_CORREL)
            
            return max(correlation, 0.0)
            
        except:
            return 0.0
    
    def _validate_document(
        self,
        extracted_data: Dict[str, Any],
        fraud_indicators: List[str],
        quality_score: float,
        document_type: str
    ) -> bool:
        """Validate document based on extracted data and checks"""
        try:
            # Check for critical fraud indicators
            critical_indicators = [
                'expired_document',
                'missing_document_number',
                'missing_name',
                'possible_tampering',
            ]
            
            for indicator in critical_indicators:
                if indicator in fraud_indicators:
                    return False
            
            # Check document quality
            if quality_score < 0.4:
                return False
            
            # Check if required fields are present
            if document_type in self.document_patterns:
                required_fields = self.document_patterns[document_type]['fields']
                for field in ['name', 'document_number']:
                    if field in required_fields and field not in extracted_data:
                        return False
            
            # Check date validity
            if 'date_of_birth' in extracted_data:
                try:
                    dob = self._parse_date(extracted_data['date_of_birth'])
                    if dob > datetime.now():
                        return False  # Future date of birth
                except:
                    pass
            
            # If we made it here, document is likely valid
            return len(fraud_indicators) <= 2  # Allow minor non-critical indicators
            
        except:
            return False
    
    def _parse_date(self, date_str: str) -> datetime:
        """Parse date string into datetime object"""
        try:
            # Try different date formats
            formats = [
                '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d',
                '%d-%m-%Y', '%m-%d-%Y', '%Y-%m-%d',
                '%d.%m.%Y', '%m.%d.%Y', '%Y.%m.%d',
                '%d %b %Y', '%b %d %Y',
            ]
            
            for fmt in formats:
                try:
                    return datetime.strptime(date_str, fmt)
                except ValueError:
                    continue
            
            # If all formats fail, try parsing year-only
            year_match = re.search(r'\b(19|20)\d{2}\b', date_str)
            if year_match:
                return datetime(int(year_match.group()), 1, 1)
            
            raise ValueError(f"Could not parse date: {date_str}")
            
        except:
            raise
    
    def _calculate_text_confidence(self, front_text: str, back_text: str) -> float:
        """Calculate confidence in extracted text"""
        try:
            # Simple confidence based on text length and character diversity
            combined = f"{front_text} {back_text}"
            
            if len(combined) < 10:
                return 0.0
            
            # Calculate character diversity
            unique_chars = len(set(combined.replace(' ', '')))
            total_chars = len(combined.replace(' ', ''))
            diversity = unique_chars / total_chars if total_chars > 0 else 0
            
            # Check for meaningful patterns (dates, numbers, names)
            date_pattern = r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b'
            number_pattern = r'\b\d{6,12}\b'
            name_pattern = r'\b[A-Z][a-z]+ [A-Z][a-z]+\b'
            
            patterns_found = 0
            if re.search(date_pattern, combined):
                patterns_found += 1
            if re.search(number_pattern, combined):
                patterns_found += 1
            if re.search(name_pattern, combined):
                patterns_found += 1
            
            pattern_score = patterns_found / 3.0
            
            # Combined confidence
            confidence = (diversity * 0.3) + (pattern_score * 0.7)
            
            return min(confidence, 1.0)
            
        except:
            return 0.0
    
    def _calculate_image_metrics(
        self, 
        front_image: Optional[np.ndarray], 
        back_image: Optional[npd.ndarray]
    ) -> Dict[str, Any]:
        """Calculate various image metrics"""
        metrics = {}
        
        try:
            for side, img in [('front', front_image), ('back', back_image)]:
                if img is None:
                    continue
                
                side_metrics = {
                    'resolution': f"{img.shape[1]}x{img.shape[0]}",
                    'brightness': float(np.mean(img) / 255.0),
                    'contrast': float(np.std(img) / 255.0),
                    'sharpness': float(cv2.Laplacian(img, cv2.CV_64F).var() / 1000.0),
                }
                metrics[f'{side}_image'] = side_metrics
            
            return metrics
            
        except:
            return {}