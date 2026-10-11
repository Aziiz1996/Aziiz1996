import unittest
from azlogistics.tools import economic_order_quantity, reorder_point

class CalculatorTests(unittest.TestCase):
    def test_eoq(self):
        self.assertAlmostEqual(economic_order_quantity(10000, 50, 2), 707.10678, places=4)

    def test_reorder_point(self):
        self.assertEqual(reorder_point(40, 5, 25), 225)

    def test_invalid_inputs(self):
        with self.assertRaises(ValueError):
            economic_order_quantity(0, 5, 2)

if __name__ == "__main__":
    unittest.main()
