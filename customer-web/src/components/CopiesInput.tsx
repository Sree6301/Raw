import React, { useState, useEffect } from 'react';
import { Stack, IconButton, TextField, Typography } from '@mui/material';
import { Plus, Minus } from 'lucide-react';

interface CopiesInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  label?: string;
}

export function CopiesInput({
  value,
  onChange,
  min = 1,
  max = 10,
  label
}: CopiesInputProps) {
  // Local string state allows user to backspace/clear without being immediately snapped back to 1
  const [textValue, setTextValue] = useState<string>(value.toString());

  useEffect(() => {
    setTextValue(value.toString());
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow empty string so user can clear and type
    if (raw === '') {
      setTextValue('');
      return;
    }
    // Only allow digits
    const cleaned = raw.replace(/[^0-9]/g, '');
    if (cleaned === '') {
      setTextValue('');
      return;
    }
    let num = parseInt(cleaned, 10);
    if (num > max) {
      num = max; // Clamp to max (10)
    }
    setTextValue(num.toString());
    onChange(Math.max(min, num));
  };

  const handleBlur = () => {
    if (textValue === '' || isNaN(parseInt(textValue, 10))) {
      setTextValue(min.toString());
      onChange(min);
    } else {
      let num = parseInt(textValue, 10);
      if (num < min) num = min;
      if (num > max) num = max;
      setTextValue(num.toString());
      onChange(num);
    }
  };

  const handleIncrement = () => {
    const next = Math.min(max, value + 1);
    setTextValue(next.toString());
    onChange(next);
  };

  const handleDecrement = () => {
    const prev = Math.max(min, value - 1);
    setTextValue(prev.toString());
    onChange(prev);
  };

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <IconButton
        onClick={handleDecrement}
        disabled={value <= min}
        size="small"
        sx={{
          border: '1px solid #cbd5e1',
          borderRadius: 1,
          p: 0.8,
          bgcolor: value <= min ? '#f8fafc' : '#ffffff',
          '&:hover': { bgcolor: '#f1f5f9' }
        }}
      >
        <Minus size={16} />
      </IconButton>

      <TextField
        value={textValue}
        onChange={handleTextChange}
        onBlur={handleBlur}
        size="small"
        inputProps={{
          style: { textAlign: 'center', fontWeight: 700, fontSize: '1rem', padding: '6px 8px' },
          inputMode: 'numeric'
        }}
        sx={{
          width: 64,
          '& .MuiOutlinedInput-root': {
            borderRadius: 1
          }
        }}
      />

      <IconButton
        onClick={handleIncrement}
        disabled={value >= max}
        size="small"
        sx={{
          border: '1px solid #cbd5e1',
          borderRadius: 1,
          p: 0.8,
          bgcolor: value >= max ? '#f8fafc' : '#ffffff',
          '&:hover': { bgcolor: '#f1f5f9' }
        }}
      >
        <Plus size={16} />
      </IconButton>

      {label && (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
          {label} (Max {max})
        </Typography>
      )}
    </Stack>
  );
}
