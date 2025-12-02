import cv2
import numpy as np
from typing import List, Dict, Any, Optional
import re
from datetime import datetime
import pytesseract
from difflib import SequenceMatcher

class OCRService:
    """OCR service for document text extraction"""
    
    def __init__(self, languages: List[str] = None):
        self.languages = languages or ['eng']
        self.setup_tesseract()
    
    def setup_tesseract(self):
        """Setup Tesseract OCR configuration"""
        # Configure Tesseract
        self.tesseract_config = {
            'config': '--oem 3 --psm 6',
            'lang': '+'.join(self.languages),
        }
    
    def extract_text(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Extract text from image
        
        Args:
            image: Input image
        
        Returns:
            Extracted text and metadata
        """
        try:
            # Preprocess image for better OCR
            processed = self._preprocess_for_ocr(image)
            
            # Extract text using Tesseract
            text = pytesseract.image_to_string(
                processed,
                config=self.tesseract_config['config'],
                lang=self.tesseract_config['lang']
            )
            
            # Extract with bounding boxes for more detail
            data = pytesseract.image_to_data(
                processed,
                config=self.tesseract_config['config'],
                lang=self.tesseract_config['lang'],
                output_type=pytesseract.Output.DICT
            )
            
            # Calculate confidence
            confidences = [float(c) for c in data['conf'] if int(c) > 0]
            avg_confidence = np.mean(confidences) if confidences else 0.0
            
            # Clean text
            cleaned_text = self._clean_text(text)
            
            return {
                'text': cleaned_text,
                'raw_text': text,
                'confidence': float(avg_confidence),
                'word_count': len(cleaned_text.split()),
                'character_count': len(cleaned_text),
                'detected_language': self._detect_language(cleaned_text),
                'bounding_boxes': self._extract_bounding_boxes(data),
            }
            
        except Exception as e:
            return {
                'text': '',
                'error': str(e),
                'confidence': 0.0,
            }
    
    def extract_document_fields(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Extract structured fields from document
        
        Args:
            image: Document image
        
        Returns:
            Structured document fields
        """
        text_result = self.extract_text(image)
        text = text_result['text']
        
        fields = {
            'document_number': self._extract_document_number(text),
            'name': self._extract_name(text),
            'date_of_birth': self._extract_date(text, 'dob'),
            'expiry_date': self._extract_date(text, 'expiry'),
            'nationality': self._extract_nationality(text),
            'address': self._extract_address(text),
            'raw_text': text,
            'confidence': text_result['confidence'],
        }
        
        return fields
    
    def validate_document_text(
        self,
        extracted_fields: Dict[str, Any],
        document_type: str = 'id_card'
    ) -> Dict[str, Any]:
        """
        Validate extracted document fields
        
        Args:
            extracted_fields: Extracted fields
            document_type: Type of document
        
        Returns:
            Validation results
        """
        validation_results = {
            'is_valid': True,
            'missing_fields': [],
            'invalid_fields': [],
            'confidence_score': 0.0,
        }
        
        required_fields = self._get_required_fields(document_type)
        confidence_scores = []
        
        for field in required_fields:
            if field not in extracted_fields or not extracted_fields[field]:
                validation_results['missing_fields'].append(field)
                validation_results['is_valid'] = False
            else:
                # Field-specific validation
                field_valid = self._validate_field(
                    field,
                    extracted_fields[field],
                    document_type
                )
                
                if not field_valid:
                    validation_results['invalid_fields'].append(field)
                    validation_results['is_valid'] = False
                
                # Calculate confidence for this field
                field_confidence = self._calculate_field_confidence(
                    field,
                    extracted_fields[field]
                )
                confidence_scores.append(field_confidence)
        
        # Calculate overall confidence
        if confidence_scores:
            validation_results['confidence_score'] = np.mean(confidence_scores)
        
        return validation_results
    
    def _preprocess_for_ocr(self, image: np.ndarray) -> np.ndarray:
        """Preprocess image for better OCR results"""
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        # Apply denoising
        denoised = cv2.fastNlMeansDenoising(gray)
        
        # Apply thresholding
        _, binary = cv2.threshold(
            denoised, 0, 255,
            cv2.THRESH_BINARY + cv2.THRESH_OTSU
        )
        
        # Apply morphological operations to clean up
        kernel = np.ones((2, 2), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        
        return cleaned
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text"""
        # Remove extra whitespace
        text = ' '.join(text.split())
        
        # Remove non-printable characters
        text = ''.join(char for char in text if char.isprintable())
        
        return text.strip()
    
    def _detect_language(self, text: str) -> str:
        """Detect language of text"""
        # Simple language detection based on common words
        common_words = {
            'en': ['the', 'and', 'of', 'to', 'in'],
            'fr': ['le', 'la', 'de', 'et', 'à'],
            'es': ['el', 'la', 'de', 'que', 'y'],
            'de': ['der', 'die', 'und', 'in', 'den'],
        }
        
        text_lower = text.lower()
        scores = {}
        
        for lang, words in common_words.items():
            score = sum(1 for word in words if word in text_lower)
            scores[lang] = score
        
        if scores:
            return max(scores.items(), key=lambda x: x[1])[0]
        
        return 'unknown'
    
    def _extract_bounding_boxes(self, tesseract_data: dict) -> List[Dict[str, Any]]:
        """Extract bounding boxes from Tesseract data"""
        boxes = []
        
        n_boxes = len(tesseract_data['level'])
        for i in range(n_boxes):
            if int(tesseract_data['conf'][i]) > 0:
                box = {
                    'text': tesseract_data['text'][i],
                    'confidence': float(tesseract_data['conf'][i]),
                    'bbox': {
                        'x': tesseract_data['left'][i],
                        'y': tesseract_data['top'][i],
                        'width': tesseract_data['width'][i],
                        'height': tesseract_data['height'][i],
                    },
                    'level': tesseract_data['level'][i],
                }
                boxes.append(box)
        
        return boxes
    
    def _extract_document_number(self, text: str) -> Optional[str]:
        """Extract document number from text"""
        patterns = [
            r'[A-Z]{1,2}\d{6,9}',  # Passport-like
            r'\d{9,12}',  # ID number
            r'[A-Z]{3}\d{6}',  # Driver's license
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group()
        
        return None
    
    def _extract_name(self, text: str) -> Optional[str]:
        """Extract name from text"""
        # Look for name patterns
        name_patterns = [
            r'NAME[:\s]+([A-Z][A-Z\s]+?)(?=\n|$)',
            r'SURNAME[:\s]+([A-Z][A-Z\s]+?)(?=\n|$)',
            r'LAST NAME[:\s]+([A-Z][A-Z\s]+?)(?=\n|$)',
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _extract_date(self, text: str, date_type: str) -> Optional[str]:
        """Extract date from text"""
        patterns = {
            'dob': [
                r'DOB[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
                r'DATE OF BIRTH[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
                r'BIRTH[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            ],
            'expiry': [
                r'EXPIRY[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
                r'EXPIRATION[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
                r'VALID UNTIL[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            ],
        }
        
        for pattern in patterns.get(date_type, []):
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        
        return None
    
    def _extract_nationality(self, text: str) -> Optional[str]:
        """Extract nationality from text"""
        match = re.search(
            r'NATIONALITY[:\s]+([A-Z\s]+?)(?=\n|$)',
            text,
            re.IGNORECASE
        )
        return match.group(1).strip() if match else None
    
    def _extract_address(self, text: str) -> Optional[str]:
        """Extract address from text"""
        match = re.search(
            r'ADDRESS[:\s]+(.+?)(?=\n\n|\n[A-Z]{2,}:|$)',
            text,
            re.DOTALL | re.IGNORECASE
        )
        return match.group(1).strip().replace('\n', ', ') if match else None
    
    def _get_required_fields(self, document_type: str) -> List[str]:
        """Get required fields for document type"""
        requirements = {
            'passport': ['document_number', 'name', 'nationality', 'date_of_birth', 'expiry_date'],
            'id_card': ['document_number', 'name', 'date_of_birth', 'expiry_date'],
            'driver_license': ['document_number', 'name', 'date_of_birth', 'expiry_date', 'address'],
        }
        return requirements.get(document_type, ['document_number', 'name'])
    
    def _validate_field(self, field: str, value: str, document_type: str) -> bool:
        """Validate specific field"""
        if not value:
            return False
        
        validators = {
            'document_number': lambda v: len(v) >= 6 and any(c.isdigit() for c in v),
            'name': lambda v: len(v) >= 2 and ' ' in v,
            'date_of_birth': self._validate_date,
            'expiry_date': self._validate_date,
            'nationality': lambda v: len(v) >= 2 and v.isalpha(),
            'address': lambda v: len(v) >= 10,
        }
        
        validator = validators.get(field)
        return validator(value) if validator else True
    
    def _validate_date(self, date_str: str) -> bool:
        """Validate date string"""
        try:
            # Try different date formats
            formats = ['%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d', '%d-%m-%Y', '%m-%d-%Y', '%Y-%m-%d']
            
            for fmt in formats:
                try:
                    datetime.strptime(date_str, fmt)
                    return True
                except ValueError:
                    continue
            
            return False
        except:
            return False
    
    def _calculate_field_confidence(self, field: str, value: str) -> float:
        """Calculate confidence score for field"""
        if not value:
            return 0.0
        
        confidence_factors = {
            'document_number': lambda v: min(len(v) / 15.0, 1.0),
            'name': lambda v: min(len(v.split()) / 3.0, 1.0),
            'date_of_birth': lambda v: 1.0 if self._validate_date(v) else 0.3,
            'expiry_date': lambda v: 1.0 if self._validate_date(v) else 0.3,
            'nationality': lambda v: 1.0 if len(v) >= 2 else 0.5,
            'address': lambda v: min(len(v) / 50.0, 1.0),
        }
        
        calculator = confidence_factors.get(field, lambda v: 0.8)
        return calculator(value)